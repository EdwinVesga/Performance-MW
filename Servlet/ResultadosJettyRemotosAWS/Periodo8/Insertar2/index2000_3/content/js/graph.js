/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 415.0, "minX": 0.0, "maxY": 15980.0, "series": [{"data": [[0.0, 415.0], [0.1, 524.0], [0.2, 585.0], [0.3, 602.0], [0.4, 614.0], [0.5, 636.0], [0.6, 648.0], [0.7, 654.0], [0.8, 669.0], [0.9, 689.0], [1.0, 704.0], [1.1, 706.0], [1.2, 712.0], [1.3, 717.0], [1.4, 745.0], [1.5, 774.0], [1.6, 785.0], [1.7, 799.0], [1.8, 813.0], [1.9, 839.0], [2.0, 884.0], [2.1, 888.0], [2.2, 912.0], [2.3, 923.0], [2.4, 944.0], [2.5, 959.0], [2.6, 967.0], [2.7, 975.0], [2.8, 988.0], [2.9, 1007.0], [3.0, 1013.0], [3.1, 1063.0], [3.2, 1115.0], [3.3, 1154.0], [3.4, 1245.0], [3.5, 1263.0], [3.6, 1323.0], [3.7, 1357.0], [3.8, 1410.0], [3.9, 1427.0], [4.0, 1432.0], [4.1, 1446.0], [4.2, 1458.0], [4.3, 1548.0], [4.4, 1613.0], [4.5, 1637.0], [4.6, 1668.0], [4.7, 1693.0], [4.8, 1788.0], [4.9, 1825.0], [5.0, 1889.0], [5.1, 1990.0], [5.2, 2054.0], [5.3, 2064.0], [5.4, 2081.0], [5.5, 2112.0], [5.6, 2201.0], [5.7, 2228.0], [5.8, 2229.0], [5.9, 2288.0], [6.0, 2312.0], [6.1, 2338.0], [6.2, 2368.0], [6.3, 2408.0], [6.4, 2467.0], [6.5, 2506.0], [6.6, 2520.0], [6.7, 2547.0], [6.8, 2592.0], [6.9, 2627.0], [7.0, 2632.0], [7.1, 2666.0], [7.2, 2693.0], [7.3, 2754.0], [7.4, 2776.0], [7.5, 2785.0], [7.6, 2806.0], [7.7, 2829.0], [7.8, 2838.0], [7.9, 2849.0], [8.0, 2886.0], [8.1, 2988.0], [8.2, 3089.0], [8.3, 3132.0], [8.4, 3186.0], [8.5, 3230.0], [8.6, 3353.0], [8.7, 3443.0], [8.8, 3462.0], [8.9, 3501.0], [9.0, 3529.0], [9.1, 3545.0], [9.2, 3567.0], [9.3, 3574.0], [9.4, 3595.0], [9.5, 3596.0], [9.6, 3611.0], [9.7, 3628.0], [9.8, 3642.0], [9.9, 3697.0], [10.0, 3705.0], [10.1, 3744.0], [10.2, 3764.0], [10.3, 3770.0], [10.4, 3776.0], [10.5, 3788.0], [10.6, 3799.0], [10.7, 3804.0], [10.8, 3812.0], [10.9, 3853.0], [11.0, 3863.0], [11.1, 3884.0], [11.2, 3888.0], [11.3, 3909.0], [11.4, 3932.0], [11.5, 3942.0], [11.6, 3950.0], [11.7, 3964.0], [11.8, 3970.0], [11.9, 3987.0], [12.0, 3990.0], [12.1, 3993.0], [12.2, 4018.0], [12.3, 4025.0], [12.4, 4039.0], [12.5, 4051.0], [12.6, 4065.0], [12.7, 4075.0], [12.8, 4094.0], [12.9, 4114.0], [13.0, 4131.0], [13.1, 4143.0], [13.2, 4156.0], [13.3, 4165.0], [13.4, 4183.0], [13.5, 4193.0], [13.6, 4197.0], [13.7, 4212.0], [13.8, 4223.0], [13.9, 4251.0], [14.0, 4260.0], [14.1, 4263.0], [14.2, 4282.0], [14.3, 4288.0], [14.4, 4312.0], [14.5, 4320.0], [14.6, 4334.0], [14.7, 4349.0], [14.8, 4363.0], [14.9, 4364.0], [15.0, 4375.0], [15.1, 4376.0], [15.2, 4383.0], [15.3, 4396.0], [15.4, 4405.0], [15.5, 4409.0], [15.6, 4419.0], [15.7, 4428.0], [15.8, 4443.0], [15.9, 4459.0], [16.0, 4465.0], [16.1, 4473.0], [16.2, 4495.0], [16.3, 4501.0], [16.4, 4504.0], [16.5, 4521.0], [16.6, 4537.0], [16.7, 4542.0], [16.8, 4548.0], [16.9, 4551.0], [17.0, 4556.0], [17.1, 4565.0], [17.2, 4581.0], [17.3, 4588.0], [17.4, 4593.0], [17.5, 4609.0], [17.6, 4619.0], [17.7, 4627.0], [17.8, 4636.0], [17.9, 4650.0], [18.0, 4653.0], [18.1, 4659.0], [18.2, 4662.0], [18.3, 4673.0], [18.4, 4675.0], [18.5, 4683.0], [18.6, 4712.0], [18.7, 4716.0], [18.8, 4730.0], [18.9, 4733.0], [19.0, 4738.0], [19.1, 4739.0], [19.2, 4740.0], [19.3, 4763.0], [19.4, 4766.0], [19.5, 4774.0], [19.6, 4776.0], [19.7, 4780.0], [19.8, 4782.0], [19.9, 4791.0], [20.0, 4795.0], [20.1, 4805.0], [20.2, 4812.0], [20.3, 4820.0], [20.4, 4832.0], [20.5, 4847.0], [20.6, 4854.0], [20.7, 4861.0], [20.8, 4864.0], [20.9, 4874.0], [21.0, 4880.0], [21.1, 4881.0], [21.2, 4889.0], [21.3, 4893.0], [21.4, 4896.0], [21.5, 4897.0], [21.6, 4908.0], [21.7, 4911.0], [21.8, 4915.0], [21.9, 4923.0], [22.0, 4943.0], [22.1, 4945.0], [22.2, 4949.0], [22.3, 4966.0], [22.4, 4968.0], [22.5, 4972.0], [22.6, 4974.0], [22.7, 4977.0], [22.8, 4991.0], [22.9, 5002.0], [23.0, 5011.0], [23.1, 5019.0], [23.2, 5034.0], [23.3, 5046.0], [23.4, 5055.0], [23.5, 5073.0], [23.6, 5087.0], [23.7, 5089.0], [23.8, 5099.0], [23.9, 5108.0], [24.0, 5125.0], [24.1, 5135.0], [24.2, 5144.0], [24.3, 5149.0], [24.4, 5188.0], [24.5, 5205.0], [24.6, 5207.0], [24.7, 5211.0], [24.8, 5213.0], [24.9, 5229.0], [25.0, 5240.0], [25.1, 5265.0], [25.2, 5293.0], [25.3, 5294.0], [25.4, 5301.0], [25.5, 5305.0], [25.6, 5309.0], [25.7, 5317.0], [25.8, 5333.0], [25.9, 5345.0], [26.0, 5351.0], [26.1, 5368.0], [26.2, 5377.0], [26.3, 5385.0], [26.4, 5394.0], [26.5, 5411.0], [26.6, 5433.0], [26.7, 5443.0], [26.8, 5446.0], [26.9, 5452.0], [27.0, 5464.0], [27.1, 5481.0], [27.2, 5503.0], [27.3, 5524.0], [27.4, 5551.0], [27.5, 5561.0], [27.6, 5566.0], [27.7, 5586.0], [27.8, 5594.0], [27.9, 5603.0], [28.0, 5606.0], [28.1, 5610.0], [28.2, 5631.0], [28.3, 5636.0], [28.4, 5640.0], [28.5, 5656.0], [28.6, 5663.0], [28.7, 5675.0], [28.8, 5686.0], [28.9, 5708.0], [29.0, 5710.0], [29.1, 5728.0], [29.2, 5747.0], [29.3, 5757.0], [29.4, 5761.0], [29.5, 5776.0], [29.6, 5803.0], [29.7, 5808.0], [29.8, 5828.0], [29.9, 5841.0], [30.0, 5849.0], [30.1, 5869.0], [30.2, 5871.0], [30.3, 5877.0], [30.4, 5886.0], [30.5, 5887.0], [30.6, 5896.0], [30.7, 5899.0], [30.8, 5901.0], [30.9, 5908.0], [31.0, 5912.0], [31.1, 5920.0], [31.2, 5947.0], [31.3, 5963.0], [31.4, 5974.0], [31.5, 5976.0], [31.6, 5999.0], [31.7, 6011.0], [31.8, 6021.0], [31.9, 6026.0], [32.0, 6045.0], [32.1, 6062.0], [32.2, 6066.0], [32.3, 6076.0], [32.4, 6094.0], [32.5, 6102.0], [32.6, 6106.0], [32.7, 6109.0], [32.8, 6125.0], [32.9, 6132.0], [33.0, 6157.0], [33.1, 6158.0], [33.2, 6180.0], [33.3, 6190.0], [33.4, 6205.0], [33.5, 6213.0], [33.6, 6214.0], [33.7, 6236.0], [33.8, 6240.0], [33.9, 6272.0], [34.0, 6275.0], [34.1, 6286.0], [34.2, 6298.0], [34.3, 6315.0], [34.4, 6329.0], [34.5, 6339.0], [34.6, 6356.0], [34.7, 6365.0], [34.8, 6370.0], [34.9, 6381.0], [35.0, 6382.0], [35.1, 6394.0], [35.2, 6410.0], [35.3, 6412.0], [35.4, 6425.0], [35.5, 6467.0], [35.6, 6482.0], [35.7, 6490.0], [35.8, 6511.0], [35.9, 6535.0], [36.0, 6548.0], [36.1, 6550.0], [36.2, 6563.0], [36.3, 6575.0], [36.4, 6580.0], [36.5, 6584.0], [36.6, 6598.0], [36.7, 6604.0], [36.8, 6620.0], [36.9, 6625.0], [37.0, 6665.0], [37.1, 6670.0], [37.2, 6676.0], [37.3, 6682.0], [37.4, 6695.0], [37.5, 6708.0], [37.6, 6713.0], [37.7, 6732.0], [37.8, 6747.0], [37.9, 6753.0], [38.0, 6776.0], [38.1, 6783.0], [38.2, 6792.0], [38.3, 6814.0], [38.4, 6816.0], [38.5, 6828.0], [38.6, 6856.0], [38.7, 6870.0], [38.8, 6874.0], [38.9, 6879.0], [39.0, 6909.0], [39.1, 6915.0], [39.2, 6925.0], [39.3, 6939.0], [39.4, 6957.0], [39.5, 6962.0], [39.6, 6975.0], [39.7, 6989.0], [39.8, 6996.0], [39.9, 7010.0], [40.0, 7013.0], [40.1, 7028.0], [40.2, 7061.0], [40.3, 7077.0], [40.4, 7101.0], [40.5, 7113.0], [40.6, 7125.0], [40.7, 7135.0], [40.8, 7153.0], [40.9, 7166.0], [41.0, 7187.0], [41.1, 7202.0], [41.2, 7210.0], [41.3, 7214.0], [41.4, 7233.0], [41.5, 7241.0], [41.6, 7263.0], [41.7, 7275.0], [41.8, 7277.0], [41.9, 7291.0], [42.0, 7296.0], [42.1, 7302.0], [42.2, 7311.0], [42.3, 7316.0], [42.4, 7324.0], [42.5, 7331.0], [42.6, 7341.0], [42.7, 7346.0], [42.8, 7351.0], [42.9, 7363.0], [43.0, 7382.0], [43.1, 7424.0], [43.2, 7433.0], [43.3, 7437.0], [43.4, 7442.0], [43.5, 7459.0], [43.6, 7473.0], [43.7, 7478.0], [43.8, 7483.0], [43.9, 7493.0], [44.0, 7497.0], [44.1, 7501.0], [44.2, 7505.0], [44.3, 7539.0], [44.4, 7545.0], [44.5, 7547.0], [44.6, 7550.0], [44.7, 7554.0], [44.8, 7564.0], [44.9, 7565.0], [45.0, 7587.0], [45.1, 7589.0], [45.2, 7597.0], [45.3, 7605.0], [45.4, 7625.0], [45.5, 7625.0], [45.6, 7630.0], [45.7, 7635.0], [45.8, 7638.0], [45.9, 7646.0], [46.0, 7649.0], [46.1, 7654.0], [46.2, 7660.0], [46.3, 7673.0], [46.4, 7675.0], [46.5, 7678.0], [46.6, 7692.0], [46.7, 7695.0], [46.8, 7710.0], [46.9, 7729.0], [47.0, 7733.0], [47.1, 7738.0], [47.2, 7744.0], [47.3, 7761.0], [47.4, 7763.0], [47.5, 7783.0], [47.6, 7789.0], [47.7, 7794.0], [47.8, 7802.0], [47.9, 7804.0], [48.0, 7820.0], [48.1, 7833.0], [48.2, 7842.0], [48.3, 7885.0], [48.4, 7890.0], [48.5, 7908.0], [48.6, 7915.0], [48.7, 7927.0], [48.8, 7938.0], [48.9, 7954.0], [49.0, 7962.0], [49.1, 7970.0], [49.2, 7977.0], [49.3, 7981.0], [49.4, 7985.0], [49.5, 7990.0], [49.6, 7992.0], [49.7, 8002.0], [49.8, 8023.0], [49.9, 8031.0], [50.0, 8033.0], [50.1, 8050.0], [50.2, 8065.0], [50.3, 8066.0], [50.4, 8070.0], [50.5, 8081.0], [50.6, 8086.0], [50.7, 8098.0], [50.8, 8113.0], [50.9, 8116.0], [51.0, 8147.0], [51.1, 8152.0], [51.2, 8157.0], [51.3, 8172.0], [51.4, 8179.0], [51.5, 8187.0], [51.6, 8203.0], [51.7, 8213.0], [51.8, 8228.0], [51.9, 8233.0], [52.0, 8240.0], [52.1, 8257.0], [52.2, 8285.0], [52.3, 8291.0], [52.4, 8310.0], [52.5, 8314.0], [52.6, 8327.0], [52.7, 8343.0], [52.8, 8378.0], [52.9, 8390.0], [53.0, 8400.0], [53.1, 8410.0], [53.2, 8429.0], [53.3, 8447.0], [53.4, 8458.0], [53.5, 8462.0], [53.6, 8474.0], [53.7, 8477.0], [53.8, 8492.0], [53.9, 8528.0], [54.0, 8546.0], [54.1, 8564.0], [54.2, 8578.0], [54.3, 8584.0], [54.4, 8600.0], [54.5, 8640.0], [54.6, 8648.0], [54.7, 8653.0], [54.8, 8685.0], [54.9, 8713.0], [55.0, 8723.0], [55.1, 8724.0], [55.2, 8730.0], [55.3, 8732.0], [55.4, 8736.0], [55.5, 8742.0], [55.6, 8747.0], [55.7, 8767.0], [55.8, 8796.0], [55.9, 8800.0], [56.0, 8817.0], [56.1, 8841.0], [56.2, 8883.0], [56.3, 8893.0], [56.4, 8913.0], [56.5, 8928.0], [56.6, 8934.0], [56.7, 8951.0], [56.8, 8978.0], [56.9, 8990.0], [57.0, 9006.0], [57.1, 9012.0], [57.2, 9032.0], [57.3, 9038.0], [57.4, 9054.0], [57.5, 9067.0], [57.6, 9070.0], [57.7, 9073.0], [57.8, 9098.0], [57.9, 9112.0], [58.0, 9120.0], [58.1, 9132.0], [58.2, 9147.0], [58.3, 9167.0], [58.4, 9175.0], [58.5, 9177.0], [58.6, 9208.0], [58.7, 9227.0], [58.8, 9266.0], [58.9, 9281.0], [59.0, 9306.0], [59.1, 9322.0], [59.2, 9350.0], [59.3, 9383.0], [59.4, 9394.0], [59.5, 9416.0], [59.6, 9427.0], [59.7, 9454.0], [59.8, 9488.0], [59.9, 9514.0], [60.0, 9526.0], [60.1, 9535.0], [60.2, 9542.0], [60.3, 9578.0], [60.4, 9603.0], [60.5, 9627.0], [60.6, 9642.0], [60.7, 9679.0], [60.8, 9709.0], [60.9, 9725.0], [61.0, 9754.0], [61.1, 9783.0], [61.2, 9794.0], [61.3, 9820.0], [61.4, 9829.0], [61.5, 9840.0], [61.6, 9850.0], [61.7, 9871.0], [61.8, 9890.0], [61.9, 9906.0], [62.0, 9931.0], [62.1, 9941.0], [62.2, 9966.0], [62.3, 9984.0], [62.4, 9994.0], [62.5, 10017.0], [62.6, 10033.0], [62.7, 10038.0], [62.8, 10061.0], [62.9, 10078.0], [63.0, 10098.0], [63.1, 10117.0], [63.2, 10132.0], [63.3, 10137.0], [63.4, 10162.0], [63.5, 10171.0], [63.6, 10178.0], [63.7, 10193.0], [63.8, 10205.0], [63.9, 10229.0], [64.0, 10238.0], [64.1, 10281.0], [64.2, 10291.0], [64.3, 10306.0], [64.4, 10308.0], [64.5, 10313.0], [64.6, 10337.0], [64.7, 10352.0], [64.8, 10361.0], [64.9, 10390.0], [65.0, 10405.0], [65.1, 10412.0], [65.2, 10418.0], [65.3, 10423.0], [65.4, 10428.0], [65.5, 10448.0], [65.6, 10472.0], [65.7, 10486.0], [65.8, 10501.0], [65.9, 10510.0], [66.0, 10522.0], [66.1, 10536.0], [66.2, 10562.0], [66.3, 10571.0], [66.4, 10590.0], [66.5, 10634.0], [66.6, 10659.0], [66.7, 10661.0], [66.8, 10702.0], [66.9, 10747.0], [67.0, 10770.0], [67.1, 10776.0], [67.2, 10784.0], [67.3, 10799.0], [67.4, 10812.0], [67.5, 10818.0], [67.6, 10824.0], [67.7, 10831.0], [67.8, 10871.0], [67.9, 10891.0], [68.0, 10904.0], [68.1, 10927.0], [68.2, 10929.0], [68.3, 10942.0], [68.4, 10951.0], [68.5, 10978.0], [68.6, 10989.0], [68.7, 11015.0], [68.8, 11034.0], [68.9, 11047.0], [69.0, 11051.0], [69.1, 11057.0], [69.2, 11066.0], [69.3, 11070.0], [69.4, 11085.0], [69.5, 11089.0], [69.6, 11106.0], [69.7, 11132.0], [69.8, 11141.0], [69.9, 11150.0], [70.0, 11170.0], [70.1, 11205.0], [70.2, 11210.0], [70.3, 11216.0], [70.4, 11224.0], [70.5, 11254.0], [70.6, 11258.0], [70.7, 11281.0], [70.8, 11292.0], [70.9, 11299.0], [71.0, 11306.0], [71.1, 11315.0], [71.2, 11335.0], [71.3, 11340.0], [71.4, 11356.0], [71.5, 11383.0], [71.6, 11411.0], [71.7, 11417.0], [71.8, 11420.0], [71.9, 11426.0], [72.0, 11430.0], [72.1, 11446.0], [72.2, 11467.0], [72.3, 11470.0], [72.4, 11478.0], [72.5, 11529.0], [72.6, 11560.0], [72.7, 11573.0], [72.8, 11579.0], [72.9, 11613.0], [73.0, 11628.0], [73.1, 11634.0], [73.2, 11650.0], [73.3, 11657.0], [73.4, 11660.0], [73.5, 11673.0], [73.6, 11682.0], [73.7, 11700.0], [73.8, 11711.0], [73.9, 11726.0], [74.0, 11732.0], [74.1, 11741.0], [74.2, 11743.0], [74.3, 11751.0], [74.4, 11765.0], [74.5, 11771.0], [74.6, 11782.0], [74.7, 11793.0], [74.8, 11800.0], [74.9, 11810.0], [75.0, 11821.0], [75.1, 11831.0], [75.2, 11845.0], [75.3, 11858.0], [75.4, 11862.0], [75.5, 11863.0], [75.6, 11866.0], [75.7, 11872.0], [75.8, 11876.0], [75.9, 11879.0], [76.0, 11883.0], [76.1, 11899.0], [76.2, 11920.0], [76.3, 11926.0], [76.4, 11933.0], [76.5, 11935.0], [76.6, 11947.0], [76.7, 11952.0], [76.8, 11957.0], [76.9, 11960.0], [77.0, 11969.0], [77.1, 11973.0], [77.2, 11977.0], [77.3, 11982.0], [77.4, 11985.0], [77.5, 11988.0], [77.6, 11994.0], [77.7, 12006.0], [77.8, 12008.0], [77.9, 12011.0], [78.0, 12018.0], [78.1, 12027.0], [78.2, 12035.0], [78.3, 12038.0], [78.4, 12043.0], [78.5, 12049.0], [78.6, 12053.0], [78.7, 12055.0], [78.8, 12058.0], [78.9, 12060.0], [79.0, 12062.0], [79.1, 12068.0], [79.2, 12076.0], [79.3, 12080.0], [79.4, 12095.0], [79.5, 12098.0], [79.6, 12102.0], [79.7, 12107.0], [79.8, 12110.0], [79.9, 12112.0], [80.0, 12114.0], [80.1, 12119.0], [80.2, 12121.0], [80.3, 12125.0], [80.4, 12140.0], [80.5, 12143.0], [80.6, 12150.0], [80.7, 12153.0], [80.8, 12154.0], [80.9, 12160.0], [81.0, 12163.0], [81.1, 12169.0], [81.2, 12175.0], [81.3, 12178.0], [81.4, 12187.0], [81.5, 12188.0], [81.6, 12194.0], [81.7, 12195.0], [81.8, 12201.0], [81.9, 12204.0], [82.0, 12213.0], [82.1, 12215.0], [82.2, 12216.0], [82.3, 12227.0], [82.4, 12246.0], [82.5, 12252.0], [82.6, 12257.0], [82.7, 12258.0], [82.8, 12261.0], [82.9, 12266.0], [83.0, 12266.0], [83.1, 12274.0], [83.2, 12287.0], [83.3, 12289.0], [83.4, 12292.0], [83.5, 12295.0], [83.6, 12298.0], [83.7, 12299.0], [83.8, 12300.0], [83.9, 12315.0], [84.0, 12322.0], [84.1, 12329.0], [84.2, 12332.0], [84.3, 12342.0], [84.4, 12345.0], [84.5, 12354.0], [84.6, 12359.0], [84.7, 12362.0], [84.8, 12363.0], [84.9, 12368.0], [85.0, 12378.0], [85.1, 12381.0], [85.2, 12383.0], [85.3, 12394.0], [85.4, 12399.0], [85.5, 12408.0], [85.6, 12417.0], [85.7, 12419.0], [85.8, 12422.0], [85.9, 12424.0], [86.0, 12426.0], [86.1, 12431.0], [86.2, 12434.0], [86.3, 12438.0], [86.4, 12439.0], [86.5, 12448.0], [86.6, 12458.0], [86.7, 12464.0], [86.8, 12467.0], [86.9, 12478.0], [87.0, 12486.0], [87.1, 12490.0], [87.2, 12500.0], [87.3, 12503.0], [87.4, 12511.0], [87.5, 12523.0], [87.6, 12535.0], [87.7, 12538.0], [87.8, 12545.0], [87.9, 12550.0], [88.0, 12556.0], [88.1, 12558.0], [88.2, 12563.0], [88.3, 12565.0], [88.4, 12572.0], [88.5, 12573.0], [88.6, 12576.0], [88.7, 12577.0], [88.8, 12584.0], [88.9, 12585.0], [89.0, 12595.0], [89.1, 12602.0], [89.2, 12609.0], [89.3, 12619.0], [89.4, 12641.0], [89.5, 12649.0], [89.6, 12656.0], [89.7, 12660.0], [89.8, 12674.0], [89.9, 12674.0], [90.0, 12698.0], [90.1, 12716.0], [90.2, 12725.0], [90.3, 12734.0], [90.4, 12738.0], [90.5, 12743.0], [90.6, 12773.0], [90.7, 12777.0], [90.8, 12786.0], [90.9, 12791.0], [91.0, 12793.0], [91.1, 12798.0], [91.2, 12801.0], [91.3, 12804.0], [91.4, 12816.0], [91.5, 12825.0], [91.6, 12836.0], [91.7, 12841.0], [91.8, 12845.0], [91.9, 12849.0], [92.0, 12856.0], [92.1, 12859.0], [92.2, 12869.0], [92.3, 12877.0], [92.4, 12897.0], [92.5, 12900.0], [92.6, 12909.0], [92.7, 12926.0], [92.8, 12940.0], [92.9, 12942.0], [93.0, 12964.0], [93.1, 12967.0], [93.2, 12978.0], [93.3, 12988.0], [93.4, 13004.0], [93.5, 13010.0], [93.6, 13017.0], [93.7, 13024.0], [93.8, 13042.0], [93.9, 13056.0], [94.0, 13056.0], [94.1, 13072.0], [94.2, 13085.0], [94.3, 13093.0], [94.4, 13094.0], [94.5, 13115.0], [94.6, 13129.0], [94.7, 13131.0], [94.8, 13147.0], [94.9, 13153.0], [95.0, 13156.0], [95.1, 13165.0], [95.2, 13168.0], [95.3, 13178.0], [95.4, 13195.0], [95.5, 13207.0], [95.6, 13212.0], [95.7, 13239.0], [95.8, 13262.0], [95.9, 13281.0], [96.0, 13303.0], [96.1, 13312.0], [96.2, 13354.0], [96.3, 13361.0], [96.4, 13371.0], [96.5, 13385.0], [96.6, 13402.0], [96.7, 13404.0], [96.8, 13413.0], [96.9, 13419.0], [97.0, 13462.0], [97.1, 13497.0], [97.2, 13538.0], [97.3, 13553.0], [97.4, 13587.0], [97.5, 13594.0], [97.6, 13660.0], [97.7, 13705.0], [97.8, 13736.0], [97.9, 13779.0], [98.0, 13811.0], [98.1, 13856.0], [98.2, 13867.0], [98.3, 13945.0], [98.4, 13958.0], [98.5, 14040.0], [98.6, 14119.0], [98.7, 14236.0], [98.8, 14287.0], [98.9, 14322.0], [99.0, 14414.0], [99.1, 14452.0], [99.2, 14481.0], [99.3, 14540.0], [99.4, 14657.0], [99.5, 14732.0], [99.6, 14823.0], [99.7, 15223.0], [99.8, 15288.0], [99.9, 15554.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 44.0, "series": [{"data": [[400.0, 2.0], [500.0, 4.0], [600.0, 13.0], [700.0, 15.0], [800.0, 10.0], [900.0, 14.0], [1000.0, 6.0], [1100.0, 4.0], [1200.0, 3.0], [1300.0, 5.0], [1400.0, 10.0], [1500.0, 2.0], [1600.0, 7.0], [1700.0, 2.0], [1800.0, 4.0], [1900.0, 2.0], [2000.0, 6.0], [2100.0, 3.0], [2200.0, 7.0], [2300.0, 7.0], [2400.0, 4.0], [2500.0, 8.0], [2600.0, 7.0], [2700.0, 7.0], [2800.0, 9.0], [2900.0, 2.0], [3000.0, 2.0], [3100.0, 5.0], [3200.0, 2.0], [3300.0, 1.0], [3400.0, 5.0], [3500.0, 13.0], [3600.0, 7.0], [3700.0, 14.0], [3800.0, 12.0], [3900.0, 18.0], [4000.0, 14.0], [4100.0, 16.0], [4300.0, 19.0], [4200.0, 15.0], [4400.0, 19.0], [4500.0, 23.0], [4600.0, 23.0], [4700.0, 30.0], [4800.0, 29.0], [4900.0, 27.0], [5000.0, 19.0], [5100.0, 13.0], [5200.0, 18.0], [5300.0, 21.0], [5500.0, 13.0], [5600.0, 21.0], [5400.0, 15.0], [5700.0, 14.0], [5800.0, 23.0], [5900.0, 18.0], [6000.0, 17.0], [6100.0, 17.0], [6200.0, 18.0], [6300.0, 19.0], [6400.0, 12.0], [6500.0, 18.0], [6600.0, 15.0], [6900.0, 18.0], [6800.0, 16.0], [6700.0, 16.0], [7000.0, 10.0], [7100.0, 14.0], [7200.0, 19.0], [7300.0, 21.0], [7400.0, 19.0], [7500.0, 25.0], [7600.0, 29.0], [7700.0, 20.0], [7800.0, 14.0], [7900.0, 25.0], [8000.0, 21.0], [8100.0, 17.0], [8400.0, 18.0], [8300.0, 13.0], [8500.0, 10.0], [8200.0, 15.0], [8600.0, 10.0], [8700.0, 20.0], [8800.0, 9.0], [8900.0, 13.0], [9000.0, 17.0], [9100.0, 15.0], [9200.0, 8.0], [9400.0, 9.0], [9600.0, 8.0], [9700.0, 9.0], [9500.0, 10.0], [9300.0, 9.0], [10100.0, 14.0], [10200.0, 11.0], [10000.0, 12.0], [9900.0, 12.0], [9800.0, 12.0], [10400.0, 17.0], [10300.0, 13.0], [10600.0, 7.0], [10700.0, 11.0], [10500.0, 13.0], [10800.0, 12.0], [10900.0, 14.0], [11200.0, 17.0], [11000.0, 19.0], [11100.0, 10.0], [11400.0, 19.0], [11600.0, 17.0], [11700.0, 22.0], [11500.0, 7.0], [11300.0, 12.0], [11800.0, 27.0], [11900.0, 30.0], [12200.0, 40.0], [12000.0, 38.0], [12100.0, 44.0], [12300.0, 35.0], [12600.0, 19.0], [12400.0, 34.0], [12500.0, 38.0], [12700.0, 22.0], [12800.0, 27.0], [13000.0, 21.0], [13100.0, 20.0], [13300.0, 11.0], [13200.0, 11.0], [12900.0, 18.0], [13400.0, 13.0], [13500.0, 7.0], [13600.0, 3.0], [13700.0, 5.0], [13800.0, 6.0], [13900.0, 5.0], [14000.0, 2.0], [14200.0, 4.0], [14100.0, 2.0], [14300.0, 2.0], [14400.0, 5.0], [14500.0, 2.0], [14600.0, 3.0], [14700.0, 2.0], [14800.0, 1.0], [15200.0, 3.0], [15100.0, 1.0], [15500.0, 2.0], [15900.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 15900.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 2.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1914.0, "series": [{"data": [[1.0, 84.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 2.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1914.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 763.2265000000002, "minX": 1.54960788E12, "maxY": 763.2265000000002, "series": [{"data": [[1.54960788E12, 763.2265000000002]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 454.0, "minX": 1.0, "maxY": 15980.0, "series": [{"data": [[3.0, 12254.5], [4.0, 12151.0], [5.0, 12467.0], [6.0, 12257.0], [7.0, 12213.0], [8.0, 12478.0], [9.0, 12511.0], [10.0, 12804.0], [11.0, 12295.0], [12.0, 12201.0], [13.0, 12221.0], [14.0, 12142.0], [15.0, 12156.0], [16.0, 12371.0], [17.0, 12362.0], [18.0, 12171.0], [19.0, 12609.0], [20.0, 12146.0], [21.0, 12154.0], [22.0, 12178.0], [23.0, 12140.0], [24.0, 12573.0], [25.0, 12342.0], [26.0, 12433.0], [27.0, 12378.0], [28.0, 12266.0], [30.0, 12412.0], [31.0, 12381.0], [33.0, 12585.0], [32.0, 13736.0], [35.0, 13660.0], [34.0, 12597.0], [37.0, 13115.0], [36.0, 13281.0], [39.0, 12095.0], [38.0, 12298.0], [41.0, 13012.5], [42.0, 12511.0], [45.0, 12538.0], [44.0, 12661.5], [47.0, 12439.0], [46.0, 12292.0], [49.0, 12363.0], [48.0, 12936.0], [51.0, 12254.0], [50.0, 12548.0], [53.0, 12378.0], [52.0, 12399.0], [55.0, 13497.0], [54.0, 12825.0], [57.0, 12112.0], [56.0, 12150.0], [59.0, 12169.0], [58.0, 12422.0], [60.0, 13287.0], [63.0, 12455.0], [62.0, 12683.5], [67.0, 12055.0], [66.0, 12366.0], [65.0, 12568.5], [71.0, 12941.0], [70.0, 12058.0], [69.0, 12434.0], [68.0, 12487.0], [75.0, 12408.0], [74.0, 13105.0], [73.0, 12315.0], [72.0, 12263.0], [79.0, 13194.0], [78.0, 12563.0], [77.0, 12428.0], [76.0, 12716.0], [83.0, 454.0], [82.0, 12266.0], [81.0, 12458.0], [80.0, 12187.0], [84.0, 8460.666666666666], [87.0, 12359.0], [86.0, 12964.5], [91.0, 12079.0], [90.0, 12060.0], [88.0, 13056.0], [95.0, 12251.0], [94.0, 12300.0], [93.0, 12060.0], [92.0, 12908.0], [99.0, 12261.0], [98.0, 14241.0], [97.0, 12660.0], [96.0, 13356.0], [101.0, 3514.5], [102.0, 6910.75], [103.0, 4868.666666666667], [107.0, 13094.0], [106.0, 12858.0], [105.0, 12558.0], [104.0, 12952.0], [111.0, 6389.5], [110.0, 13403.0], [109.0, 12300.0], [108.0, 12877.0], [113.0, 4660.0], [115.0, 12101.0], [114.0, 12942.0], [112.0, 12775.0], [119.0, 3639.25], [118.0, 6401.0], [117.0, 6553.5], [116.0, 6650.5], [120.0, 6571.5], [123.0, 6335.0], [122.0, 12072.0], [121.0, 11926.0], [124.0, 4753.333333333334], [127.0, 4875.0], [125.0, 13401.0], [128.0, 3590.25], [129.0, 6507.5], [133.0, 3790.0], [132.0, 6436.0], [135.0, 6334.0], [134.0, 12102.0], [131.0, 12417.0], [130.0, 12839.0], [137.0, 4513.666666666666], [136.0, 7666.5], [138.0, 7045.0], [139.0, 7106.0], [143.0, 3680.5], [142.0, 4013.5], [141.0, 13093.0], [140.0, 13492.0], [144.0, 3764.75], [151.0, 12573.0], [150.0, 13079.0], [149.0, 12576.0], [148.0, 12036.0], [147.0, 12408.0], [146.0, 12926.0], [145.0, 12165.0], [157.0, 4818.333333333334], [159.0, 12423.0], [158.0, 11985.0], [156.0, 12793.0], [155.0, 11933.0], [154.0, 13385.0], [153.0, 13168.0], [152.0, 13163.0], [167.0, 12312.0], [166.0, 13312.0], [165.0, 12296.0], [164.0, 13010.0], [163.0, 12810.5], [161.0, 12216.0], [160.0, 12572.0], [174.0, 6655.0], [173.0, 13361.0], [172.0, 11960.0], [171.0, 12368.0], [170.0, 15980.0], [169.0, 11994.0], [168.0, 12299.0], [183.0, 12003.0], [182.0, 12347.0], [181.0, 12619.0], [180.0, 12345.0], [179.0, 13173.0], [178.0, 13072.0], [177.0, 12246.0], [176.0, 13033.0], [191.0, 12335.0], [190.0, 12076.0], [189.0, 12516.0], [188.0, 13594.0], [187.0, 12859.0], [186.0, 12656.0], [185.0, 12282.5], [194.0, 5050.333333333334], [193.0, 6897.5], [192.0, 3988.0], [196.0, 8693.0], [199.0, 12332.0], [198.0, 12287.0], [197.0, 12978.0], [201.0, 6913.5], [204.0, 6755.5], [207.0, 912.0], [206.0, 11883.0], [205.0, 12323.0], [203.0, 12500.0], [202.0, 12602.0], [200.0, 11985.0], [208.0, 8697.333333333334], [215.0, 12609.0], [214.0, 13218.0], [213.0, 12558.0], [212.0, 12565.0], [211.0, 12816.0], [210.0, 12841.0], [209.0, 12112.0], [216.0, 6484.5], [218.0, 6590.5], [223.0, 12106.0], [222.0, 12045.0], [221.0, 12438.0], [220.0, 11969.0], [219.0, 12436.0], [217.0, 14698.0], [229.0, 7133.5], [231.0, 8115.0], [230.0, 11970.0], [228.0, 13006.0], [227.0, 12539.0], [226.0, 12674.0], [225.0, 12049.0], [224.0, 12978.0], [234.0, 4812.0], [239.0, 12215.0], [238.0, 14636.0], [237.0, 13117.0], [236.0, 12188.0], [235.0, 12194.0], [233.0, 12897.0], [232.0, 11979.0], [242.0, 6647.0], [247.0, 11771.0], [246.0, 12043.0], [245.0, 12468.0], [244.0, 12791.0], [243.0, 12204.0], [241.0, 13156.0], [240.0, 12802.0], [252.0, 6488.0], [255.0, 12595.0], [254.0, 12367.5], [251.0, 12816.0], [250.0, 12874.0], [249.0, 12080.0], [248.0, 12011.0], [270.0, 12572.0], [271.0, 6947.0], [269.0, 11879.0], [268.0, 14079.0], [267.0, 12555.0], [266.0, 11881.0], [265.0, 12396.0], [264.0, 11928.0], [263.0, 12008.0], [257.0, 12213.0], [256.0, 12900.0], [259.0, 12114.0], [258.0, 12038.0], [262.0, 12988.0], [261.0, 12579.0], [260.0, 12290.0], [286.0, 15288.0], [274.0, 6955.0], [277.0, 5338.666666666666], [276.0, 12163.0], [279.0, 11920.0], [273.0, 12738.0], [272.0, 11922.0], [278.0, 12205.0], [287.0, 11793.0], [285.0, 12490.0], [284.0, 11952.0], [275.0, 12040.0], [283.0, 12293.0], [282.0, 12357.0], [281.0, 14786.0], [280.0, 15502.0], [303.0, 12260.0], [297.0, 6588.0], [302.0, 12641.0], [301.0, 11988.0], [300.0, 11810.0], [291.0, 11650.0], [290.0, 12354.0], [289.0, 12495.0], [288.0, 12270.0], [299.0, 11863.0], [298.0, 12656.0], [296.0, 12725.0], [295.0, 11785.0], [294.0, 12466.0], [293.0, 11992.0], [292.0, 12018.0], [318.0, 12143.0], [319.0, 14732.0], [317.0, 11977.0], [316.0, 12195.0], [315.0, 11732.0], [314.0, 13153.0], [313.0, 12577.0], [312.0, 12683.0], [311.0, 12119.0], [305.0, 12227.0], [304.0, 12098.0], [307.0, 14823.0], [306.0, 12061.0], [310.0, 11743.0], [309.0, 11726.0], [308.0, 11910.0], [333.0, 7895.0], [321.0, 7004.0], [320.0, 12066.0], [322.0, 13094.0], [327.0, 6666.5], [326.0, 6811.5], [325.0, 11732.0], [324.0, 15554.0], [335.0, 7109.5], [334.0, 15140.0], [332.0, 11821.0], [323.0, 12424.0], [331.0, 12322.0], [330.0, 12399.0], [329.0, 11982.0], [328.0, 12035.0], [350.0, 13584.0], [343.0, 6542.0], [337.0, 11657.0], [336.0, 13856.0], [339.0, 11862.0], [338.0, 11723.0], [342.0, 11973.0], [341.0, 11660.0], [340.0, 12909.0], [351.0, 11605.0], [349.0, 12161.0], [348.0, 15255.0], [347.0, 12567.0], [346.0, 12965.0], [345.0, 12558.0], [344.0, 11865.0], [367.0, 7746.5], [356.0, 6628.0], [357.0, 11957.0], [359.0, 11427.0], [353.0, 11673.0], [352.0, 12330.0], [355.0, 12419.0], [354.0, 11492.0], [358.0, 11866.0], [363.0, 4820.333333333334], [364.0, 6527.0], [365.0, 6895.0], [366.0, 12288.0], [362.0, 11858.0], [361.0, 11751.0], [360.0, 11711.0], [382.0, 5486.666666666666], [376.0, 4650.666666666666], [379.0, 7153.0], [381.0, 7387.5], [383.0, 5500.0], [380.0, 13402.0], [378.0, 12120.0], [377.0, 14322.0], [375.0, 12121.0], [369.0, 12176.0], [368.0, 12011.0], [371.0, 14481.0], [370.0, 12017.0], [374.0, 12233.0], [373.0, 12192.0], [372.0, 12216.0], [398.0, 13498.0], [384.0, 7707.0], [385.0, 11430.0], [387.0, 12614.0], [386.0, 11426.0], [391.0, 11361.0], [390.0, 11257.0], [389.0, 10472.0], [388.0, 12026.0], [399.0, 13958.0], [397.0, 11424.0], [396.0, 12007.0], [395.0, 14657.0], [394.0, 11876.0], [393.0, 11947.0], [392.0, 11411.0], [415.0, 13779.0], [404.0, 5319.333333333334], [406.0, 11862.0], [405.0, 11213.0], [408.0, 6806.5], [414.0, 13705.0], [413.0, 12796.0], [412.0, 14528.0], [403.0, 11132.0], [402.0, 13239.0], [401.0, 13178.0], [400.0, 12940.0], [407.0, 11845.0], [411.0, 12053.0], [410.0, 13587.0], [409.0, 11765.0], [430.0, 6487.0], [431.0, 11708.0], [429.0, 11885.0], [428.0, 13863.0], [427.0, 12849.0], [426.0, 14365.0], [425.0, 11574.0], [424.0, 11420.0], [423.0, 12824.0], [416.0, 11560.0], [419.0, 11727.0], [418.0, 13506.5], [422.0, 11047.0], [421.0, 11053.0], [420.0, 12743.0], [446.0, 6669.5], [447.0, 14119.0], [445.0, 14470.0], [444.0, 13307.0], [443.0, 11034.0], [442.0, 11340.0], [441.0, 11682.0], [440.0, 12329.0], [439.0, 11818.0], [432.0, 13151.0], [434.0, 13855.0], [433.0, 14452.0], [438.0, 13928.0], [437.0, 11451.0], [436.0, 12434.0], [462.0, 12431.0], [448.0, 6051.0], [449.0, 13773.0], [451.0, 11141.0], [450.0, 11347.0], [463.0, 12967.0], [461.0, 11859.0], [460.0, 11799.0], [459.0, 13042.0], [457.0, 11837.0], [456.0, 11300.0], [455.0, 11294.0], [454.0, 13811.0], [453.0, 11657.0], [452.0, 11190.0], [479.0, 6292.0], [464.0, 6769.0], [471.0, 10929.0], [470.0, 13550.0], [469.0, 14135.0], [468.0, 11051.0], [475.0, 6404.0], [478.0, 11208.0], [477.0, 11700.0], [476.0, 12194.0], [467.0, 12154.0], [466.0, 14418.0], [465.0, 12734.0], [474.0, 12869.0], [473.0, 11532.0], [472.0, 11872.0], [495.0, 13967.0], [489.0, 7400.0], [493.0, 11573.0], [492.0, 11336.0], [491.0, 13017.0], [490.0, 11383.0], [488.0, 10978.0], [487.0, 13710.0], [480.0, 12674.0], [483.0, 12125.0], [482.0, 13440.0], [486.0, 13867.0], [485.0, 12828.0], [484.0, 14040.0], [510.0, 11299.0], [511.0, 6639.0], [509.0, 11145.0], [508.0, 12856.0], [507.0, 11205.0], [506.0, 11766.0], [505.0, 11334.0], [504.0, 11254.0], [503.0, 11935.0], [497.0, 11281.0], [496.0, 11282.0], [499.0, 12362.0], [498.0, 11067.0], [502.0, 13538.0], [501.0, 12968.0], [500.0, 13087.0], [518.0, 11150.0], [538.0, 5626.0], [515.0, 7686.0], [519.0, 7422.5], [517.0, 12109.0], [516.0, 11634.0], [537.0, 13208.0], [536.0, 11047.0], [521.0, 8304.333333333334], [523.0, 12800.0], [522.0, 11870.0], [525.0, 10634.0], [524.0, 13032.0], [527.0, 13354.0], [512.0, 11567.0], [514.0, 13664.0], [513.0, 13413.0], [526.0, 11872.0], [530.0, 5835.666666666666], [534.0, 7353.0], [533.0, 13165.0], [532.0, 13212.0], [531.0, 11686.0], [535.0, 11082.0], [540.0, 7475.5], [539.0, 10799.0], [541.0, 13404.0], [542.0, 7494.5], [543.0, 10928.0], [529.0, 12289.0], [528.0, 13207.0], [570.0, 11625.0], [574.0, 11877.0], [547.0, 6489.0], [546.0, 11292.0], [545.0, 10600.0], [544.0, 11776.0], [548.0, 11136.0], [559.0, 11310.0], [558.0, 13046.0], [557.0, 12058.0], [556.0, 11066.0], [555.0, 13363.0], [554.0, 10660.0], [553.0, 13587.0], [552.0, 12565.0], [549.0, 7284.0], [564.0, 6709.0], [567.0, 7704.0], [566.0, 13415.0], [565.0, 10812.0], [575.0, 11941.0], [561.0, 12448.0], [560.0, 12186.0], [563.0, 10904.0], [562.0, 13462.0], [573.0, 12630.0], [572.0, 10820.0], [571.0, 11675.0], [569.0, 13131.0], [568.0, 13419.0], [551.0, 12844.0], [550.0, 12266.0], [600.0, 4594.6], [579.0, 6882.5], [578.0, 6327.0], [577.0, 10162.0], [576.0, 11335.0], [591.0, 11210.0], [590.0, 10510.0], [589.0, 10771.0], [588.0, 10667.0], [587.0, 13303.0], [586.0, 10770.0], [585.0, 10522.0], [584.0, 12585.0], [583.0, 6813.0], [582.0, 12738.0], [581.0, 12523.0], [580.0, 11579.0], [592.0, 7744.5], [597.0, 6986.0], [599.0, 11828.0], [598.0, 12527.0], [596.0, 7676.0], [595.0, 11952.0], [594.0, 11070.0], [593.0, 10501.0], [607.0, 10403.0], [606.0, 10418.0], [605.0, 10308.0], [604.0, 13004.0], [603.0, 10940.0], [602.0, 10590.0], [601.0, 13154.0], [632.0, 12722.0], [623.0, 4959.5], [613.0, 7474.0], [612.0, 10405.0], [611.0, 12545.0], [610.0, 10891.0], [609.0, 12132.0], [608.0, 10831.0], [615.0, 10311.0], [614.0, 11170.0], [633.0, 12032.0], [635.0, 10061.0], [634.0, 11276.0], [636.0, 6622.5], [638.0, 10824.0], [624.0, 10374.0], [637.0, 10171.0], [616.0, 7283.5], [617.0, 11470.0], [618.0, 6244.0], [622.0, 6873.0], [621.0, 11414.0], [620.0, 10291.0], [619.0, 12845.0], [625.0, 6590.5], [626.0, 7530.5], [627.0, 6567.5], [630.0, 5084.0], [629.0, 11085.0], [628.0, 10719.0], [631.0, 10590.0], [665.0, 12419.0], [641.0, 7149.0], [640.0, 7404.75], [647.0, 6994.0], [646.0, 10117.0], [645.0, 10313.0], [644.0, 12856.0], [643.0, 12894.0], [642.0, 10428.0], [664.0, 10567.0], [666.0, 12657.0], [667.0, 7366.5], [670.0, 7045.5], [669.0, 9820.0], [668.0, 11471.0], [671.0, 9991.0], [649.0, 7670.333333333333], [650.0, 7556.5], [653.0, 7079.0], [652.0, 10098.0], [651.0, 9906.0], [654.0, 10702.0], [655.0, 10352.0], [656.0, 6798.5], [658.0, 5199.333333333334], [657.0, 9900.0], [659.0, 10214.0], [660.0, 6694.5], [661.0, 6228.0], [663.0, 12503.0], [662.0, 9850.0], [700.0, 11057.0], [675.0, 6660.5], [679.0, 6309.5], [678.0, 9745.0], [677.0, 10178.0], [676.0, 9984.0], [697.0, 11000.0], [696.0, 10927.0], [681.0, 7194.0], [680.0, 11224.0], [683.0, 11468.0], [682.0, 12322.0], [685.0, 11648.0], [684.0, 10949.0], [687.0, 10423.0], [672.0, 9941.0], [674.0, 9994.0], [673.0, 10875.0], [686.0, 10033.0], [703.0, 11809.0], [689.0, 10509.0], [688.0, 10127.0], [691.0, 10562.0], [690.0, 10871.0], [693.0, 10017.0], [692.0, 11467.0], [695.0, 11957.0], [694.0, 10238.0], [702.0, 9890.0], [701.0, 9805.0], [699.0, 11664.0], [698.0, 10137.0], [732.0, 9869.0], [735.0, 9155.0], [721.0, 9036.0], [720.0, 10412.0], [723.0, 9931.0], [722.0, 9122.0], [725.0, 8996.0], [724.0, 9938.0], [734.0, 11027.0], [733.0, 10757.0], [731.0, 8736.0], [730.0, 9927.0], [729.0, 9427.0], [728.0, 9392.0], [719.0, 9494.0], [705.0, 10976.0], [704.0, 10106.0], [707.0, 9227.0], [706.0, 11628.0], [709.0, 10776.0], [708.0, 10317.0], [711.0, 10536.0], [710.0, 10826.0], [718.0, 9120.0], [717.0, 9514.0], [716.0, 11015.0], [715.0, 10337.0], [714.0, 9171.0], [713.0, 9794.0], [712.0, 10448.0], [727.0, 9350.0], [726.0, 9176.0], [764.0, 8796.0], [767.0, 9175.0], [753.0, 9008.0], [752.0, 9368.0], [755.0, 9520.0], [754.0, 11106.0], [757.0, 11089.0], [756.0, 9383.0], [766.0, 10909.0], [765.0, 10942.0], [763.0, 8719.0], [762.0, 11239.0], [761.0, 9627.0], [760.0, 9562.0], [751.0, 8886.0], [737.0, 9709.0], [736.0, 10988.0], [739.0, 10306.0], [738.0, 10409.0], [741.0, 11098.0], [740.0, 11439.0], [743.0, 9294.0], [742.0, 9322.0], [750.0, 11065.0], [749.0, 10521.0], [748.0, 11410.0], [747.0, 8730.0], [746.0, 8951.0], [745.0, 10038.0], [744.0, 10467.0], [759.0, 10293.0], [758.0, 10571.0], [796.0, 9210.0], [799.0, 9189.0], [785.0, 10422.0], [784.0, 9526.0], [787.0, 9679.0], [786.0, 10815.0], [789.0, 9012.0], [788.0, 9488.0], [798.0, 10205.0], [797.0, 9642.0], [795.0, 9112.0], [794.0, 9528.0], [793.0, 8410.0], [792.0, 8392.0], [783.0, 9603.0], [769.0, 9459.0], [768.0, 8941.0], [771.0, 10193.0], [770.0, 8978.0], [773.0, 10338.0], [772.0, 9840.0], [775.0, 10784.0], [774.0, 8913.0], [782.0, 10800.0], [781.0, 9340.0], [780.0, 8731.0], [779.0, 8990.0], [778.0, 10033.0], [777.0, 10423.0], [776.0, 10354.0], [791.0, 9117.0], [790.0, 8600.0], [828.0, 10134.0], [831.0, 9281.0], [816.0, 9966.0], [819.0, 9354.5], [817.0, 9061.0], [821.0, 8341.0], [820.0, 10007.0], [830.0, 10484.0], [829.0, 7978.0], [827.0, 9032.0], [826.0, 8390.0], [825.0, 8893.0], [824.0, 10233.0], [815.0, 9436.0], [801.0, 10788.0], [800.0, 10639.0], [803.0, 9454.0], [802.0, 9038.0], [805.0, 8653.0], [804.0, 8343.0], [807.0, 8640.0], [806.0, 8732.0], [813.0, 9871.0], [812.0, 8651.0], [811.0, 10747.0], [810.0, 8788.0], [809.0, 8140.0], [808.0, 9147.0], [823.0, 8841.0], [822.0, 9405.0], [860.0, 5350.0], [849.0, 5209.0], [857.0, 5079.75], [856.0, 4681.6], [839.0, 7774.0], [838.0, 8093.0], [837.0, 9954.0], [836.0, 10132.0], [835.0, 10155.0], [834.0, 7962.0], [833.0, 10081.0], [832.0, 9177.0], [847.0, 9082.0], [846.0, 8157.0], [845.0, 9073.0], [844.0, 8179.0], [843.0, 8310.0], [842.0, 8696.0], [840.0, 7801.0], [855.0, 4191.166666666667], [854.0, 4521.833333333334], [853.0, 5955.5], [852.0, 8453.0], [851.0, 7731.0], [850.0, 7982.0], [859.0, 9886.0], [858.0, 8050.0], [861.0, 10659.0], [863.0, 8984.0], [848.0, 7977.0], [862.0, 8796.0], [889.0, 5995.0], [873.0, 6607.0], [872.0, 9783.0], [874.0, 7626.0], [876.0, 9592.0], [875.0, 8478.0], [877.0, 6433.0], [880.0, 5374.5], [887.0, 7710.0], [886.0, 7986.0], [885.0, 7985.0], [884.0, 7625.0], [883.0, 7995.0], [882.0, 9098.0], [881.0, 7793.0], [895.0, 7351.0], [888.0, 6026.5], [871.0, 8026.0], [870.0, 8233.0], [869.0, 7837.0], [868.0, 7820.0], [867.0, 9754.0], [866.0, 8048.0], [865.0, 9025.0], [864.0, 9832.0], [879.0, 10307.0], [878.0, 9688.0], [892.0, 5749.5], [891.0, 5587.5], [890.0, 6491.0], [893.0, 6783.5], [894.0, 7108.5], [923.0, 6057.0], [903.0, 5073.666666666667], [910.0, 6639.5], [909.0, 7855.0], [908.0, 10062.0], [907.0, 10290.0], [906.0, 7101.0], [905.0, 8084.0], [904.0, 7785.0], [911.0, 7927.0], [896.0, 8152.0], [898.0, 7549.0], [897.0, 8367.0], [900.0, 9725.0], [899.0, 8288.0], [902.0, 8240.0], [901.0, 8403.0], [913.0, 4956.75], [912.0, 7302.0], [915.0, 10486.0], [914.0, 8900.0], [917.0, 7187.0], [916.0, 8934.0], [927.0, 9277.0], [926.0, 8767.0], [919.0, 5204.666666666667], [918.0, 6101.5], [921.0, 6149.0], [920.0, 8932.0], [922.0, 7794.0], [924.0, 6388.5], [925.0, 5854.0], [953.0, 6902.0], [929.0, 5205.0], [928.0, 5614.333333333333], [932.0, 5291.0], [931.0, 6776.5], [930.0, 8883.0], [939.0, 5480.5], [938.0, 7363.0], [937.0, 8571.0], [936.0, 8222.0], [940.0, 6019.0], [943.0, 5222.5], [942.0, 7083.0], [941.0, 9675.0], [944.0, 6138.5], [945.0, 9721.0], [957.0, 6340.5], [956.0, 7744.0], [955.0, 8065.0], [954.0, 10172.0], [958.0, 7062.0], [959.0, 8281.0], [952.0, 5536.5], [935.0, 8228.0], [934.0, 7678.0], [933.0, 9976.0], [946.0, 5231.75], [947.0, 5686.333333333333], [948.0, 5677.0], [951.0, 9578.0], [950.0, 9537.0], [949.0, 9233.0], [966.0, 6646.5], [961.0, 6097.0], [960.0, 5653.5], [972.0, 5050.0], [974.0, 8400.0], [973.0, 7311.0], [975.0, 7483.0], [970.0, 5546.666666666667], [971.0, 6230.0], [962.0, 5336.333333333333], [964.0, 5603.333333333333], [965.0, 9136.0], [963.0, 5432.666666666667], [967.0, 6883.0], [979.0, 5151.5], [986.0, 7065.0], [985.0, 6817.0], [988.0, 6506.5], [989.0, 7291.0], [991.0, 6840.0], [978.0, 7351.0], [977.0, 7143.5], [990.0, 8115.0], [987.0, 5969.0], [983.0, 5074.2], [982.0, 8723.0], [981.0, 7214.0], [980.0, 7241.0], [984.0, 5850.5], [969.0, 5748.0], [968.0, 5583.666666666667], [1016.0, 5468.5], [1003.0, 5269.4], [995.0, 5734.0], [999.0, 5531.0], [998.0, 7202.0], [997.0, 7263.0], [996.0, 9612.0], [1021.0, 6207.5], [1020.0, 7305.0], [1019.0, 6957.0], [1018.0, 7630.0], [1017.0, 8314.0], [1023.0, 4583.2], [1009.0, 6587.0], [1008.0, 6705.0], [1022.0, 6733.5], [1000.0, 5491.0], [1002.0, 5174.5], [1001.0, 5618.5], [1004.0, 5543.333333333333], [1005.0, 6490.0], [1006.0, 4551.0], [1007.0, 7343.0], [992.0, 6550.0], [994.0, 9067.0], [993.0, 8161.0], [1010.0, 5763.5], [1013.0, 6218.5], [1012.0, 9167.0], [1011.0, 9067.0], [1014.0, 5541.333333333333], [1015.0, 7497.0], [1026.0, 5259.0], [1024.0, 5671.0], [1054.0, 7686.0], [1052.0, 9132.0], [1050.0, 6547.0], [1048.0, 5959.5], [1046.0, 8724.0], [1044.0, 8447.0], [1040.0, 5444.2], [1042.0, 6284.5], [1028.0, 6174.0], [1030.0, 5519.0], [1032.0, 5995.0], [1034.0, 7320.0], [1036.0, 8230.0], [1038.0, 8549.0], [1072.0, 5880.0], [1074.0, 5565.5], [1076.0, 7113.0], [1078.0, 5426.333333333333], [1080.0, 6178.0], [1082.0, 6054.666666666667], [1084.0, 6689.5], [1086.0, 8070.0], [1056.0, 5716.666666666667], [1060.0, 6023.333333333333], [1062.0, 6938.5], [1064.0, 8458.0], [1066.0, 8257.0], [1068.0, 6143.0], [1070.0, 6628.0], [1058.0, 6078.0], [1098.0, 5965.5], [1094.0, 5548.5], [1090.0, 6481.0], [1088.0, 6913.0], [1092.0, 8023.0], [1116.0, 7620.0], [1114.0, 8081.0], [1112.0, 7751.0], [1118.0, 8291.0], [1096.0, 5409.0], [1100.0, 6488.5], [1102.0, 8432.0], [1124.0, 8685.0], [1122.0, 8113.0], [1120.0, 8213.0], [1150.0, 6688.0], [1146.0, 5237.8], [1148.0, 5742.0], [1142.0, 5671.5], [1144.0, 6182.5], [1140.0, 5149.6], [1138.0, 6872.0], [1136.0, 8148.0], [1126.0, 6082.5], [1128.0, 7654.0], [1130.0, 6403.0], [1134.0, 5681.5], [1132.0, 8234.0], [1108.0, 4818.0], [1106.0, 8172.0], [1104.0, 7452.0], [1110.0, 7437.0], [1154.0, 6548.0], [1152.0, 5860.5], [1182.0, 5283.0], [1178.0, 5181.333333333333], [1176.0, 7442.0], [1180.0, 5423.2], [1174.0, 6537.0], [1172.0, 6356.0], [1170.0, 7646.0], [1168.0, 4966.6], [1156.0, 5344.5], [1158.0, 5843.5], [1160.0, 5169.833333333333], [1162.0, 7733.0], [1164.0, 5694.0], [1200.0, 5999.333333333333], [1202.0, 7344.0], [1206.0, 5783.666666666667], [1208.0, 6111.5], [1212.0, 7296.0], [1214.0, 5580.75], [1204.0, 5680.5], [1184.0, 5793.0], [1186.0, 8471.0], [1188.0, 5305.25], [1190.0, 6534.5], [1192.0, 5324.4], [1194.0, 6140.0], [1196.0, 6324.0], [1198.0, 6165.0], [1166.0, 5410.0], [1224.0, 7324.0], [1216.0, 6007.0], [1218.0, 7583.0], [1246.0, 5939.0], [1244.0, 5779.333333333333], [1242.0, 7733.0], [1240.0, 7028.0], [1238.0, 7660.0], [1222.0, 6168.333333333333], [1220.0, 7316.0], [1228.0, 5843.0], [1226.0, 6011.0], [1248.0, 6060.333333333333], [1252.0, 7501.0], [1250.0, 7564.0], [1274.0, 7546.0], [1276.0, 7000.5], [1278.0, 5916.0], [1268.0, 6145.5], [1266.0, 7572.0], [1264.0, 7346.0], [1230.0, 7539.0], [1270.0, 6674.0], [1272.0, 7599.0], [1254.0, 6757.0], [1256.0, 5618.75], [1260.0, 6005.333333333333], [1262.0, 7694.0], [1258.0, 5860.0], [1232.0, 6072.0], [1234.0, 6240.5], [1236.0, 6003.25], [1286.0, 6588.0], [1292.0, 6065.75], [1282.0, 6057.5], [1280.0, 6315.0], [1284.0, 6678.0], [1310.0, 5748.0], [1308.0, 5909.0], [1306.0, 6301.5], [1304.0, 6620.0], [1296.0, 6580.0], [1298.0, 6599.0], [1300.0, 6392.0], [1302.0, 5886.0], [1288.0, 5705.5], [1290.0, 5899.0], [1294.0, 6925.0], [1316.0, 5558.5], [1318.0, 5980.0], [1326.0, 6180.0], [1324.0, 6283.0], [1322.0, 6557.0], [1320.0, 6381.0], [1314.0, 5818.333333333333], [1312.0, 6838.0], [1338.0, 5613.0], [1340.0, 5920.0], [1342.0, 5664.0], [1334.0, 6398.0], [1336.0, 5451.0], [1330.0, 5594.0], [1332.0, 5805.0], [1328.0, 5956.4], [1348.0, 5689.0], [1372.0, 6149.0], [1344.0, 6043.5], [1346.0, 6286.0], [1350.0, 5609.0], [1352.0, 6382.0], [1374.0, 6962.0], [1354.0, 5603.0], [1356.0, 5949.5], [1358.0, 6255.5], [1376.0, 5565.0], [1378.0, 4968.0], [1380.0, 7296.0], [1382.0, 5803.0], [1362.0, 5796.333333333333], [1360.0, 6131.0], [1366.0, 5519.5], [1364.0, 5887.0], [1368.0, 6109.0], [1370.0, 5974.0], [1031.0, 7974.0], [1035.0, 5936.0], [1027.0, 6058.5], [1055.0, 4946.5], [1053.0, 7477.0], [1051.0, 8053.0], [1047.0, 8582.0], [1045.0, 7813.0], [1043.0, 9418.0], [1049.0, 5241.75], [1041.0, 6031.5], [1025.0, 5748.5], [1029.0, 9108.0], [1033.0, 8695.0], [1037.0, 5498.333333333333], [1039.0, 8462.0], [1073.0, 7653.0], [1075.0, 6783.0], [1079.0, 7912.0], [1081.0, 7249.0], [1083.0, 4644.75], [1085.0, 6595.5], [1087.0, 6975.0], [1077.0, 6063.0], [1061.0, 9054.0], [1063.0, 5727.5], [1065.0, 8807.0], [1069.0, 5808.666666666667], [1071.0, 6732.0], [1067.0, 6361.0], [1059.0, 6085.0], [1057.0, 8747.0], [1099.0, 6879.0], [1103.0, 6696.5], [1091.0, 6224.5], [1089.0, 8098.0], [1093.0, 7547.0], [1117.0, 6452.5], [1115.0, 7157.0], [1113.0, 6814.0], [1119.0, 8327.0], [1095.0, 6784.0], [1097.0, 8147.0], [1101.0, 8209.0], [1125.0, 5318.25], [1123.0, 8326.0], [1121.0, 7890.0], [1151.0, 5719.333333333333], [1149.0, 7763.0], [1147.0, 5693.833333333333], [1145.0, 6601.0], [1141.0, 8187.0], [1143.0, 8586.0], [1139.0, 5928.5], [1137.0, 7116.0], [1127.0, 5933.0], [1129.0, 7842.0], [1135.0, 5203.0], [1133.0, 5871.0], [1131.0, 8002.0], [1107.0, 5885.666666666667], [1105.0, 6410.0], [1109.0, 6159.0], [1111.0, 5768.0], [1155.0, 7938.0], [1157.0, 5132.5], [1181.0, 6424.666666666667], [1183.0, 5921.0], [1179.0, 5388.1], [1177.0, 6550.0], [1173.0, 7433.0], [1171.0, 7637.0], [1175.0, 6620.0], [1169.0, 5747.5], [1153.0, 6148.5], [1159.0, 5012.5], [1161.0, 6670.0], [1163.0, 7550.0], [1165.0, 5496.666666666666], [1167.0, 5531.0], [1203.0, 5862.666666666667], [1201.0, 7105.0], [1205.0, 5083.857142857142], [1207.0, 7886.0], [1209.0, 6593.0], [1213.0, 5718.0], [1211.0, 6398.5], [1215.0, 6444.333333333333], [1185.0, 6557.5], [1191.0, 6776.0], [1193.0, 6048.5], [1195.0, 6753.0], [1197.0, 6091.5], [1199.0, 5895.0], [1189.0, 5526.666666666667], [1187.0, 6276.0], [1225.0, 6883.0], [1219.0, 6189.0], [1217.0, 7329.0], [1247.0, 5857.0], [1243.0, 7431.0], [1241.0, 6926.0], [1245.0, 5553.285714285715], [1237.0, 5464.5], [1239.0, 6209.5], [1221.0, 6881.0], [1223.0, 7597.0], [1227.0, 7728.0], [1229.0, 6541.0], [1251.0, 7275.0], [1249.0, 7783.0], [1279.0, 6665.0], [1275.0, 5482.0], [1277.0, 6062.0], [1267.0, 7605.0], [1231.0, 7424.0], [1269.0, 6957.0], [1271.0, 7625.0], [1273.0, 5855.666666666667], [1255.0, 7346.0], [1257.0, 5982.0], [1259.0, 5465.333333333333], [1261.0, 7061.0], [1263.0, 6870.0], [1233.0, 5690.8], [1235.0, 6080.666666666667], [1287.0, 6020.666666666667], [1281.0, 6529.0], [1283.0, 6417.0], [1311.0, 5457.333333333333], [1309.0, 6625.0], [1307.0, 5427.666666666667], [1305.0, 6969.0], [1297.0, 5777.0], [1299.0, 6365.0], [1301.0, 6682.0], [1303.0, 6281.0], [1285.0, 6122.0], [1289.0, 6237.5], [1291.0, 5888.0], [1293.0, 6117.0], [1295.0, 5002.0], [1317.0, 5907.0], [1319.0, 5956.5], [1327.0, 6028.666666666667], [1325.0, 6337.0], [1323.0, 6412.0], [1315.0, 5971.0], [1313.0, 6021.0], [1339.0, 6909.0], [1341.0, 6158.0], [1343.0, 5766.0], [1333.0, 5913.0], [1335.0, 6563.0], [1337.0, 6321.0], [1331.0, 5922.666666666667], [1329.0, 6052.25], [1351.0, 6467.0], [1353.0, 6020.0], [1345.0, 6158.0], [1347.0, 6939.0], [1349.0, 6106.0], [1375.0, 5733.0], [1373.0, 6274.0], [1355.0, 5968.666666666667], [1357.0, 5633.0], [1359.0, 6102.0], [1377.0, 5212.0], [1379.0, 6045.0], [1381.0, 5964.75], [1383.0, 5733.0], [1363.0, 5645.0], [1361.0, 5904.0], [1365.0, 6382.0], [1367.0, 5305.0], [1369.0, 6612.0], [1371.0, 6105.5], [1.0, 12443.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[763.2265000000002, 8211.283000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1383.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 12500.0, "minX": 1.54960788E12, "maxY": 14032.383333333333, "series": [{"data": [[1.54960788E12, 14032.383333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960788E12, 12500.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 8211.283000000001, "minX": 1.54960788E12, "maxY": 8211.283000000001, "series": [{"data": [[1.54960788E12, 8211.283000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 8211.277499999997, "minX": 1.54960788E12, "maxY": 8211.277499999997, "series": [{"data": [[1.54960788E12, 8211.277499999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 56.08149999999986, "minX": 1.54960788E12, "maxY": 56.08149999999986, "series": [{"data": [[1.54960788E12, 56.08149999999986]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 415.0, "minX": 1.54960788E12, "maxY": 15980.0, "series": [{"data": [[1.54960788E12, 15980.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960788E12, 415.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960788E12, 12696.500000000002]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960788E12, 14413.51]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960788E12, 13155.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 8032.0, "minX": 33.0, "maxY": 8032.0, "series": [{"data": [[33.0, 8032.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 8032.0, "minX": 33.0, "maxY": 8032.0, "series": [{"data": [[33.0, 8032.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960788E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960788E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960788E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960788E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960788E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960788E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
