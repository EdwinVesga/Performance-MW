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
        data: {"result": {"minY": 527.0, "minX": 0.0, "maxY": 16691.0, "series": [{"data": [[0.0, 527.0], [0.1, 553.0], [0.2, 612.0], [0.3, 618.0], [0.4, 654.0], [0.5, 666.0], [0.6, 689.0], [0.7, 700.0], [0.8, 752.0], [0.9, 760.0], [1.0, 785.0], [1.1, 804.0], [1.2, 835.0], [1.3, 854.0], [1.4, 866.0], [1.5, 873.0], [1.6, 887.0], [1.7, 903.0], [1.8, 945.0], [1.9, 957.0], [2.0, 1047.0], [2.1, 1060.0], [2.2, 1093.0], [2.3, 1128.0], [2.4, 1679.0], [2.5, 1744.0], [2.6, 1753.0], [2.7, 1827.0], [2.8, 1863.0], [2.9, 1872.0], [3.0, 1915.0], [3.1, 1949.0], [3.2, 1955.0], [3.3, 1984.0], [3.4, 2019.0], [3.5, 2029.0], [3.6, 2110.0], [3.7, 2213.0], [3.8, 2223.0], [3.9, 2337.0], [4.0, 2388.0], [4.1, 2424.0], [4.2, 2491.0], [4.3, 2508.0], [4.4, 2527.0], [4.5, 2596.0], [4.6, 2613.0], [4.7, 2681.0], [4.8, 2694.0], [4.9, 2737.0], [5.0, 2801.0], [5.1, 2827.0], [5.2, 2975.0], [5.3, 3001.0], [5.4, 3021.0], [5.5, 3027.0], [5.6, 3056.0], [5.7, 3065.0], [5.8, 3120.0], [5.9, 3143.0], [6.0, 3183.0], [6.1, 3194.0], [6.2, 3223.0], [6.3, 3235.0], [6.4, 3258.0], [6.5, 3303.0], [6.6, 3364.0], [6.7, 3366.0], [6.8, 3394.0], [6.9, 3420.0], [7.0, 3429.0], [7.1, 3435.0], [7.2, 3440.0], [7.3, 3453.0], [7.4, 3468.0], [7.5, 3503.0], [7.6, 3516.0], [7.7, 3519.0], [7.8, 3532.0], [7.9, 3540.0], [8.0, 3542.0], [8.1, 3547.0], [8.2, 3558.0], [8.3, 3620.0], [8.4, 3641.0], [8.5, 3650.0], [8.6, 3659.0], [8.7, 3661.0], [8.8, 3689.0], [8.9, 3694.0], [9.0, 3745.0], [9.1, 3767.0], [9.2, 3788.0], [9.3, 3807.0], [9.4, 3843.0], [9.5, 3849.0], [9.6, 3883.0], [9.7, 3896.0], [9.8, 3912.0], [9.9, 3917.0], [10.0, 3924.0], [10.1, 3928.0], [10.2, 3948.0], [10.3, 3954.0], [10.4, 3972.0], [10.5, 3977.0], [10.6, 3983.0], [10.7, 3992.0], [10.8, 4015.0], [10.9, 4031.0], [11.0, 4044.0], [11.1, 4065.0], [11.2, 4066.0], [11.3, 4084.0], [11.4, 4103.0], [11.5, 4122.0], [11.6, 4123.0], [11.7, 4124.0], [11.8, 4129.0], [11.9, 4134.0], [12.0, 4144.0], [12.1, 4153.0], [12.2, 4157.0], [12.3, 4162.0], [12.4, 4163.0], [12.5, 4170.0], [12.6, 4179.0], [12.7, 4186.0], [12.8, 4189.0], [12.9, 4204.0], [13.0, 4217.0], [13.1, 4235.0], [13.2, 4242.0], [13.3, 4247.0], [13.4, 4268.0], [13.5, 4278.0], [13.6, 4284.0], [13.7, 4288.0], [13.8, 4298.0], [13.9, 4310.0], [14.0, 4314.0], [14.1, 4318.0], [14.2, 4323.0], [14.3, 4336.0], [14.4, 4358.0], [14.5, 4360.0], [14.6, 4368.0], [14.7, 4370.0], [14.8, 4389.0], [14.9, 4401.0], [15.0, 4417.0], [15.1, 4433.0], [15.2, 4444.0], [15.3, 4453.0], [15.4, 4456.0], [15.5, 4460.0], [15.6, 4484.0], [15.7, 4490.0], [15.8, 4498.0], [15.9, 4507.0], [16.0, 4516.0], [16.1, 4530.0], [16.2, 4538.0], [16.3, 4546.0], [16.4, 4555.0], [16.5, 4561.0], [16.6, 4566.0], [16.7, 4583.0], [16.8, 4586.0], [16.9, 4590.0], [17.0, 4598.0], [17.1, 4608.0], [17.2, 4613.0], [17.3, 4649.0], [17.4, 4662.0], [17.5, 4672.0], [17.6, 4683.0], [17.7, 4686.0], [17.8, 4702.0], [17.9, 4711.0], [18.0, 4715.0], [18.1, 4717.0], [18.2, 4731.0], [18.3, 4742.0], [18.4, 4746.0], [18.5, 4750.0], [18.6, 4754.0], [18.7, 4761.0], [18.8, 4768.0], [18.9, 4779.0], [19.0, 4781.0], [19.1, 4784.0], [19.2, 4792.0], [19.3, 4799.0], [19.4, 4804.0], [19.5, 4814.0], [19.6, 4822.0], [19.7, 4828.0], [19.8, 4836.0], [19.9, 4853.0], [20.0, 4867.0], [20.1, 4874.0], [20.2, 4876.0], [20.3, 4886.0], [20.4, 4899.0], [20.5, 4923.0], [20.6, 4954.0], [20.7, 4965.0], [20.8, 4972.0], [20.9, 4974.0], [21.0, 4981.0], [21.1, 5004.0], [21.2, 5015.0], [21.3, 5025.0], [21.4, 5029.0], [21.5, 5040.0], [21.6, 5058.0], [21.7, 5071.0], [21.8, 5076.0], [21.9, 5082.0], [22.0, 5097.0], [22.1, 5122.0], [22.2, 5139.0], [22.3, 5158.0], [22.4, 5173.0], [22.5, 5188.0], [22.6, 5244.0], [22.7, 5251.0], [22.8, 5258.0], [22.9, 5276.0], [23.0, 5279.0], [23.1, 5296.0], [23.2, 5305.0], [23.3, 5322.0], [23.4, 5335.0], [23.5, 5341.0], [23.6, 5378.0], [23.7, 5382.0], [23.8, 5408.0], [23.9, 5423.0], [24.0, 5433.0], [24.1, 5442.0], [24.2, 5463.0], [24.3, 5505.0], [24.4, 5533.0], [24.5, 5547.0], [24.6, 5556.0], [24.7, 5564.0], [24.8, 5585.0], [24.9, 5625.0], [25.0, 5652.0], [25.1, 5688.0], [25.2, 5711.0], [25.3, 5718.0], [25.4, 5737.0], [25.5, 5748.0], [25.6, 5758.0], [25.7, 5764.0], [25.8, 5785.0], [25.9, 5807.0], [26.0, 5822.0], [26.1, 5842.0], [26.2, 5856.0], [26.3, 5867.0], [26.4, 5874.0], [26.5, 5879.0], [26.6, 5883.0], [26.7, 5885.0], [26.8, 5892.0], [26.9, 5906.0], [27.0, 5910.0], [27.1, 5931.0], [27.2, 5946.0], [27.3, 5963.0], [27.4, 5975.0], [27.5, 5980.0], [27.6, 5983.0], [27.7, 5995.0], [27.8, 5999.0], [27.9, 6018.0], [28.0, 6031.0], [28.1, 6034.0], [28.2, 6046.0], [28.3, 6073.0], [28.4, 6088.0], [28.5, 6117.0], [28.6, 6133.0], [28.7, 6166.0], [28.8, 6168.0], [28.9, 6186.0], [29.0, 6196.0], [29.1, 6206.0], [29.2, 6215.0], [29.3, 6227.0], [29.4, 6235.0], [29.5, 6254.0], [29.6, 6259.0], [29.7, 6270.0], [29.8, 6282.0], [29.9, 6325.0], [30.0, 6333.0], [30.1, 6345.0], [30.2, 6356.0], [30.3, 6363.0], [30.4, 6367.0], [30.5, 6380.0], [30.6, 6401.0], [30.7, 6415.0], [30.8, 6433.0], [30.9, 6439.0], [31.0, 6463.0], [31.1, 6473.0], [31.2, 6483.0], [31.3, 6484.0], [31.4, 6511.0], [31.5, 6523.0], [31.6, 6542.0], [31.7, 6552.0], [31.8, 6561.0], [31.9, 6568.0], [32.0, 6573.0], [32.1, 6575.0], [32.2, 6586.0], [32.3, 6595.0], [32.4, 6618.0], [32.5, 6646.0], [32.6, 6653.0], [32.7, 6667.0], [32.8, 6697.0], [32.9, 6715.0], [33.0, 6727.0], [33.1, 6739.0], [33.2, 6752.0], [33.3, 6763.0], [33.4, 6790.0], [33.5, 6792.0], [33.6, 6796.0], [33.7, 6806.0], [33.8, 6809.0], [33.9, 6816.0], [34.0, 6829.0], [34.1, 6838.0], [34.2, 6846.0], [34.3, 6863.0], [34.4, 6878.0], [34.5, 6890.0], [34.6, 6895.0], [34.7, 6909.0], [34.8, 6915.0], [34.9, 6930.0], [35.0, 6934.0], [35.1, 6949.0], [35.2, 6952.0], [35.3, 6960.0], [35.4, 6969.0], [35.5, 6977.0], [35.6, 7014.0], [35.7, 7023.0], [35.8, 7037.0], [35.9, 7045.0], [36.0, 7076.0], [36.1, 7078.0], [36.2, 7094.0], [36.3, 7101.0], [36.4, 7110.0], [36.5, 7125.0], [36.6, 7128.0], [36.7, 7133.0], [36.8, 7148.0], [36.9, 7154.0], [37.0, 7169.0], [37.1, 7174.0], [37.2, 7188.0], [37.3, 7196.0], [37.4, 7204.0], [37.5, 7205.0], [37.6, 7216.0], [37.7, 7224.0], [37.8, 7236.0], [37.9, 7244.0], [38.0, 7266.0], [38.1, 7273.0], [38.2, 7284.0], [38.3, 7295.0], [38.4, 7307.0], [38.5, 7321.0], [38.6, 7332.0], [38.7, 7348.0], [38.8, 7362.0], [38.9, 7389.0], [39.0, 7393.0], [39.1, 7420.0], [39.2, 7429.0], [39.3, 7430.0], [39.4, 7437.0], [39.5, 7442.0], [39.6, 7460.0], [39.7, 7474.0], [39.8, 7490.0], [39.9, 7512.0], [40.0, 7522.0], [40.1, 7554.0], [40.2, 7563.0], [40.3, 7573.0], [40.4, 7579.0], [40.5, 7589.0], [40.6, 7598.0], [40.7, 7623.0], [40.8, 7623.0], [40.9, 7627.0], [41.0, 7630.0], [41.1, 7637.0], [41.2, 7640.0], [41.3, 7671.0], [41.4, 7676.0], [41.5, 7697.0], [41.6, 7707.0], [41.7, 7734.0], [41.8, 7738.0], [41.9, 7749.0], [42.0, 7769.0], [42.1, 7772.0], [42.2, 7785.0], [42.3, 7825.0], [42.4, 7832.0], [42.5, 7844.0], [42.6, 7864.0], [42.7, 7874.0], [42.8, 7881.0], [42.9, 7887.0], [43.0, 7897.0], [43.1, 7914.0], [43.2, 7928.0], [43.3, 7935.0], [43.4, 7947.0], [43.5, 7955.0], [43.6, 7961.0], [43.7, 7966.0], [43.8, 7973.0], [43.9, 7993.0], [44.0, 8000.0], [44.1, 8002.0], [44.2, 8007.0], [44.3, 8015.0], [44.4, 8019.0], [44.5, 8026.0], [44.6, 8036.0], [44.7, 8041.0], [44.8, 8054.0], [44.9, 8061.0], [45.0, 8074.0], [45.1, 8079.0], [45.2, 8082.0], [45.3, 8100.0], [45.4, 8107.0], [45.5, 8108.0], [45.6, 8113.0], [45.7, 8116.0], [45.8, 8144.0], [45.9, 8150.0], [46.0, 8164.0], [46.1, 8165.0], [46.2, 8176.0], [46.3, 8185.0], [46.4, 8201.0], [46.5, 8211.0], [46.6, 8212.0], [46.7, 8216.0], [46.8, 8233.0], [46.9, 8251.0], [47.0, 8251.0], [47.1, 8252.0], [47.2, 8263.0], [47.3, 8272.0], [47.4, 8292.0], [47.5, 8294.0], [47.6, 8299.0], [47.7, 8310.0], [47.8, 8324.0], [47.9, 8346.0], [48.0, 8359.0], [48.1, 8371.0], [48.2, 8375.0], [48.3, 8393.0], [48.4, 8403.0], [48.5, 8409.0], [48.6, 8411.0], [48.7, 8421.0], [48.8, 8426.0], [48.9, 8434.0], [49.0, 8435.0], [49.1, 8453.0], [49.2, 8462.0], [49.3, 8465.0], [49.4, 8481.0], [49.5, 8493.0], [49.6, 8502.0], [49.7, 8507.0], [49.8, 8521.0], [49.9, 8539.0], [50.0, 8546.0], [50.1, 8560.0], [50.2, 8579.0], [50.3, 8606.0], [50.4, 8615.0], [50.5, 8629.0], [50.6, 8636.0], [50.7, 8648.0], [50.8, 8680.0], [50.9, 8688.0], [51.0, 8704.0], [51.1, 8709.0], [51.2, 8723.0], [51.3, 8727.0], [51.4, 8752.0], [51.5, 8781.0], [51.6, 8782.0], [51.7, 8789.0], [51.8, 8796.0], [51.9, 8802.0], [52.0, 8827.0], [52.1, 8838.0], [52.2, 8856.0], [52.3, 8871.0], [52.4, 8876.0], [52.5, 8877.0], [52.6, 8897.0], [52.7, 8920.0], [52.8, 8925.0], [52.9, 8940.0], [53.0, 8951.0], [53.1, 8959.0], [53.2, 8963.0], [53.3, 8966.0], [53.4, 8977.0], [53.5, 8986.0], [53.6, 8993.0], [53.7, 8997.0], [53.8, 9014.0], [53.9, 9018.0], [54.0, 9021.0], [54.1, 9044.0], [54.2, 9045.0], [54.3, 9055.0], [54.4, 9064.0], [54.5, 9077.0], [54.6, 9099.0], [54.7, 9114.0], [54.8, 9130.0], [54.9, 9145.0], [55.0, 9147.0], [55.1, 9176.0], [55.2, 9183.0], [55.3, 9187.0], [55.4, 9206.0], [55.5, 9221.0], [55.6, 9239.0], [55.7, 9246.0], [55.8, 9254.0], [55.9, 9268.0], [56.0, 9271.0], [56.1, 9281.0], [56.2, 9303.0], [56.3, 9308.0], [56.4, 9334.0], [56.5, 9337.0], [56.6, 9361.0], [56.7, 9362.0], [56.8, 9378.0], [56.9, 9391.0], [57.0, 9400.0], [57.1, 9404.0], [57.2, 9408.0], [57.3, 9425.0], [57.4, 9435.0], [57.5, 9453.0], [57.6, 9459.0], [57.7, 9468.0], [57.8, 9489.0], [57.9, 9502.0], [58.0, 9506.0], [58.1, 9516.0], [58.2, 9527.0], [58.3, 9542.0], [58.4, 9578.0], [58.5, 9589.0], [58.6, 9596.0], [58.7, 9620.0], [58.8, 9637.0], [58.9, 9655.0], [59.0, 9669.0], [59.1, 9683.0], [59.2, 9691.0], [59.3, 9735.0], [59.4, 9741.0], [59.5, 9750.0], [59.6, 9753.0], [59.7, 9757.0], [59.8, 9767.0], [59.9, 9771.0], [60.0, 9784.0], [60.1, 9796.0], [60.2, 9804.0], [60.3, 9810.0], [60.4, 9817.0], [60.5, 9818.0], [60.6, 9821.0], [60.7, 9823.0], [60.8, 9846.0], [60.9, 9851.0], [61.0, 9855.0], [61.1, 9867.0], [61.2, 9886.0], [61.3, 9903.0], [61.4, 9919.0], [61.5, 9935.0], [61.6, 9949.0], [61.7, 9950.0], [61.8, 9975.0], [61.9, 9978.0], [62.0, 10007.0], [62.1, 10013.0], [62.2, 10027.0], [62.3, 10040.0], [62.4, 10066.0], [62.5, 10081.0], [62.6, 10089.0], [62.7, 10097.0], [62.8, 10112.0], [62.9, 10131.0], [63.0, 10146.0], [63.1, 10163.0], [63.2, 10168.0], [63.3, 10173.0], [63.4, 10199.0], [63.5, 10239.0], [63.6, 10261.0], [63.7, 10268.0], [63.8, 10274.0], [63.9, 10285.0], [64.0, 10306.0], [64.1, 10311.0], [64.2, 10321.0], [64.3, 10328.0], [64.4, 10359.0], [64.5, 10368.0], [64.6, 10388.0], [64.7, 10401.0], [64.8, 10411.0], [64.9, 10429.0], [65.0, 10436.0], [65.1, 10455.0], [65.2, 10459.0], [65.3, 10468.0], [65.4, 10480.0], [65.5, 10524.0], [65.6, 10540.0], [65.7, 10559.0], [65.8, 10576.0], [65.9, 10585.0], [66.0, 10594.0], [66.1, 10631.0], [66.2, 10647.0], [66.3, 10655.0], [66.4, 10678.0], [66.5, 10691.0], [66.6, 10708.0], [66.7, 10710.0], [66.8, 10711.0], [66.9, 10739.0], [67.0, 10753.0], [67.1, 10773.0], [67.2, 10789.0], [67.3, 10797.0], [67.4, 10818.0], [67.5, 10826.0], [67.6, 10829.0], [67.7, 10853.0], [67.8, 10879.0], [67.9, 10887.0], [68.0, 10892.0], [68.1, 10910.0], [68.2, 10928.0], [68.3, 10939.0], [68.4, 10940.0], [68.5, 10944.0], [68.6, 10954.0], [68.7, 10964.0], [68.8, 10971.0], [68.9, 10994.0], [69.0, 11046.0], [69.1, 11056.0], [69.2, 11060.0], [69.3, 11072.0], [69.4, 11084.0], [69.5, 11103.0], [69.6, 11108.0], [69.7, 11148.0], [69.8, 11163.0], [69.9, 11172.0], [70.0, 11173.0], [70.1, 11206.0], [70.2, 11222.0], [70.3, 11226.0], [70.4, 11229.0], [70.5, 11234.0], [70.6, 11234.0], [70.7, 11246.0], [70.8, 11255.0], [70.9, 11265.0], [71.0, 11274.0], [71.1, 11278.0], [71.2, 11307.0], [71.3, 11315.0], [71.4, 11337.0], [71.5, 11339.0], [71.6, 11346.0], [71.7, 11353.0], [71.8, 11358.0], [71.9, 11365.0], [72.0, 11400.0], [72.1, 11427.0], [72.2, 11440.0], [72.3, 11459.0], [72.4, 11473.0], [72.5, 11501.0], [72.6, 11514.0], [72.7, 11520.0], [72.8, 11535.0], [72.9, 11562.0], [73.0, 11573.0], [73.1, 11582.0], [73.2, 11584.0], [73.3, 11590.0], [73.4, 11638.0], [73.5, 11656.0], [73.6, 11684.0], [73.7, 11698.0], [73.8, 11701.0], [73.9, 11703.0], [74.0, 11708.0], [74.1, 11710.0], [74.2, 11730.0], [74.3, 11735.0], [74.4, 11741.0], [74.5, 11757.0], [74.6, 11783.0], [74.7, 11794.0], [74.8, 11812.0], [74.9, 11820.0], [75.0, 11837.0], [75.1, 11851.0], [75.2, 11871.0], [75.3, 11883.0], [75.4, 11892.0], [75.5, 11900.0], [75.6, 11908.0], [75.7, 11910.0], [75.8, 11919.0], [75.9, 11923.0], [76.0, 11932.0], [76.1, 11941.0], [76.2, 11943.0], [76.3, 11950.0], [76.4, 11966.0], [76.5, 11969.0], [76.6, 11988.0], [76.7, 12008.0], [76.8, 12023.0], [76.9, 12037.0], [77.0, 12058.0], [77.1, 12061.0], [77.2, 12074.0], [77.3, 12085.0], [77.4, 12093.0], [77.5, 12099.0], [77.6, 12105.0], [77.7, 12134.0], [77.8, 12149.0], [77.9, 12163.0], [78.0, 12170.0], [78.1, 12175.0], [78.2, 12180.0], [78.3, 12192.0], [78.4, 12194.0], [78.5, 12220.0], [78.6, 12230.0], [78.7, 12244.0], [78.8, 12263.0], [78.9, 12279.0], [79.0, 12286.0], [79.1, 12293.0], [79.2, 12303.0], [79.3, 12315.0], [79.4, 12334.0], [79.5, 12361.0], [79.6, 12364.0], [79.7, 12377.0], [79.8, 12385.0], [79.9, 12390.0], [80.0, 12396.0], [80.1, 12405.0], [80.2, 12410.0], [80.3, 12413.0], [80.4, 12415.0], [80.5, 12443.0], [80.6, 12469.0], [80.7, 12490.0], [80.8, 12501.0], [80.9, 12519.0], [81.0, 12525.0], [81.1, 12537.0], [81.2, 12546.0], [81.3, 12554.0], [81.4, 12568.0], [81.5, 12582.0], [81.6, 12585.0], [81.7, 12605.0], [81.8, 12615.0], [81.9, 12634.0], [82.0, 12641.0], [82.1, 12647.0], [82.2, 12653.0], [82.3, 12675.0], [82.4, 12684.0], [82.5, 12699.0], [82.6, 12701.0], [82.7, 12719.0], [82.8, 12737.0], [82.9, 12743.0], [83.0, 12778.0], [83.1, 12787.0], [83.2, 12793.0], [83.3, 12798.0], [83.4, 12811.0], [83.5, 12819.0], [83.6, 12826.0], [83.7, 12837.0], [83.8, 12853.0], [83.9, 12860.0], [84.0, 12861.0], [84.1, 12869.0], [84.2, 12874.0], [84.3, 12883.0], [84.4, 12898.0], [84.5, 12905.0], [84.6, 12909.0], [84.7, 12910.0], [84.8, 12925.0], [84.9, 12949.0], [85.0, 12954.0], [85.1, 12958.0], [85.2, 12971.0], [85.3, 12987.0], [85.4, 12991.0], [85.5, 12996.0], [85.6, 13004.0], [85.7, 13013.0], [85.8, 13018.0], [85.9, 13021.0], [86.0, 13024.0], [86.1, 13030.0], [86.2, 13040.0], [86.3, 13041.0], [86.4, 13043.0], [86.5, 13044.0], [86.6, 13047.0], [86.7, 13064.0], [86.8, 13065.0], [86.9, 13082.0], [87.0, 13089.0], [87.1, 13106.0], [87.2, 13117.0], [87.3, 13123.0], [87.4, 13137.0], [87.5, 13148.0], [87.6, 13159.0], [87.7, 13166.0], [87.8, 13181.0], [87.9, 13190.0], [88.0, 13193.0], [88.1, 13200.0], [88.2, 13201.0], [88.3, 13224.0], [88.4, 13232.0], [88.5, 13243.0], [88.6, 13250.0], [88.7, 13253.0], [88.8, 13263.0], [88.9, 13277.0], [89.0, 13284.0], [89.1, 13286.0], [89.2, 13301.0], [89.3, 13313.0], [89.4, 13319.0], [89.5, 13341.0], [89.6, 13346.0], [89.7, 13352.0], [89.8, 13358.0], [89.9, 13374.0], [90.0, 13405.0], [90.1, 13406.0], [90.2, 13407.0], [90.3, 13411.0], [90.4, 13417.0], [90.5, 13418.0], [90.6, 13429.0], [90.7, 13431.0], [90.8, 13442.0], [90.9, 13446.0], [91.0, 13454.0], [91.1, 13461.0], [91.2, 13466.0], [91.3, 13470.0], [91.4, 13475.0], [91.5, 13482.0], [91.6, 13495.0], [91.7, 13508.0], [91.8, 13514.0], [91.9, 13520.0], [92.0, 13522.0], [92.1, 13539.0], [92.2, 13545.0], [92.3, 13551.0], [92.4, 13554.0], [92.5, 13574.0], [92.6, 13581.0], [92.7, 13586.0], [92.8, 13595.0], [92.9, 13606.0], [93.0, 13621.0], [93.1, 13633.0], [93.2, 13634.0], [93.3, 13635.0], [93.4, 13639.0], [93.5, 13650.0], [93.6, 13680.0], [93.7, 13694.0], [93.8, 13700.0], [93.9, 13703.0], [94.0, 13716.0], [94.1, 13733.0], [94.2, 13738.0], [94.3, 13746.0], [94.4, 13751.0], [94.5, 13767.0], [94.6, 13767.0], [94.7, 13776.0], [94.8, 13814.0], [94.9, 13843.0], [95.0, 13902.0], [95.1, 13910.0], [95.2, 13938.0], [95.3, 13967.0], [95.4, 13976.0], [95.5, 14075.0], [95.6, 14109.0], [95.7, 14174.0], [95.8, 14213.0], [95.9, 14267.0], [96.0, 14280.0], [96.1, 14329.0], [96.2, 14338.0], [96.3, 14351.0], [96.4, 14446.0], [96.5, 14453.0], [96.6, 14473.0], [96.7, 14504.0], [96.8, 14514.0], [96.9, 14565.0], [97.0, 14607.0], [97.1, 14623.0], [97.2, 14634.0], [97.3, 14648.0], [97.4, 14727.0], [97.5, 14759.0], [97.6, 14807.0], [97.7, 14875.0], [97.8, 14908.0], [97.9, 14915.0], [98.0, 14937.0], [98.1, 14999.0], [98.2, 15062.0], [98.3, 15069.0], [98.4, 15161.0], [98.5, 15167.0], [98.6, 15236.0], [98.7, 15294.0], [98.8, 15357.0], [98.9, 15423.0], [99.0, 15481.0], [99.1, 15624.0], [99.2, 15684.0], [99.3, 15836.0], [99.4, 16028.0], [99.5, 16358.0], [99.6, 16390.0], [99.7, 16457.0], [99.8, 16600.0], [99.9, 16676.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 34.0, "series": [{"data": [[500.0, 3.0], [600.0, 10.0], [700.0, 8.0], [800.0, 12.0], [900.0, 6.0], [1000.0, 6.0], [1100.0, 2.0], [1600.0, 2.0], [1700.0, 5.0], [1800.0, 6.0], [1900.0, 8.0], [2000.0, 4.0], [2100.0, 2.0], [2200.0, 4.0], [2300.0, 3.0], [2400.0, 5.0], [2500.0, 5.0], [2600.0, 6.0], [2800.0, 3.0], [2700.0, 3.0], [2900.0, 3.0], [3000.0, 10.0], [3100.0, 7.0], [3300.0, 7.0], [3200.0, 7.0], [3400.0, 13.0], [3500.0, 16.0], [3600.0, 13.0], [3700.0, 6.0], [3800.0, 10.0], [3900.0, 20.0], [4000.0, 12.0], [4100.0, 30.0], [4200.0, 19.0], [4300.0, 20.0], [4400.0, 20.0], [4500.0, 24.0], [4600.0, 15.0], [4700.0, 31.0], [4800.0, 22.0], [4900.0, 13.0], [5000.0, 19.0], [5100.0, 10.0], [5200.0, 12.0], [5300.0, 13.0], [5500.0, 12.0], [5400.0, 10.0], [5600.0, 5.0], [5700.0, 15.0], [5800.0, 20.0], [5900.0, 19.0], [6100.0, 11.0], [6000.0, 13.0], [6200.0, 16.0], [6300.0, 15.0], [6400.0, 16.0], [6600.0, 10.0], [6500.0, 19.0], [6700.0, 16.0], [6800.0, 21.0], [6900.0, 18.0], [7000.0, 14.0], [7100.0, 21.0], [7400.0, 17.0], [7200.0, 21.0], [7300.0, 14.0], [7600.0, 18.0], [7500.0, 15.0], [7800.0, 16.0], [7700.0, 14.0], [7900.0, 19.0], [8000.0, 26.0], [8100.0, 22.0], [8200.0, 25.0], [8500.0, 15.0], [8300.0, 15.0], [8400.0, 23.0], [8600.0, 14.0], [8700.0, 18.0], [9100.0, 15.0], [8900.0, 22.0], [9000.0, 18.0], [9200.0, 16.0], [8800.0, 15.0], [9400.0, 18.0], [9300.0, 16.0], [9500.0, 15.0], [9700.0, 18.0], [9600.0, 12.0], [9800.0, 23.0], [10000.0, 16.0], [10100.0, 13.0], [10200.0, 10.0], [9900.0, 14.0], [10600.0, 10.0], [10300.0, 15.0], [10700.0, 16.0], [10500.0, 12.0], [10400.0, 15.0], [10800.0, 14.0], [11200.0, 22.0], [11100.0, 12.0], [10900.0, 18.0], [11000.0, 11.0], [11600.0, 9.0], [11300.0, 16.0], [11400.0, 10.0], [11500.0, 17.0], [11700.0, 20.0], [11800.0, 14.0], [11900.0, 24.0], [12200.0, 14.0], [12100.0, 18.0], [12000.0, 17.0], [12300.0, 18.0], [12400.0, 15.0], [12500.0, 17.0], [12600.0, 18.0], [12700.0, 16.0], [12900.0, 23.0], [13000.0, 30.0], [13200.0, 22.0], [13100.0, 20.0], [12800.0, 22.0], [13300.0, 16.0], [13400.0, 34.0], [13500.0, 23.0], [13600.0, 19.0], [13700.0, 20.0], [13800.0, 4.0], [13900.0, 9.0], [14200.0, 6.0], [14300.0, 7.0], [14000.0, 3.0], [14100.0, 3.0], [14400.0, 5.0], [14800.0, 3.0], [14700.0, 5.0], [14600.0, 7.0], [14500.0, 7.0], [14900.0, 8.0], [15000.0, 5.0], [15100.0, 3.0], [15200.0, 4.0], [15300.0, 2.0], [15400.0, 4.0], [15600.0, 4.0], [15800.0, 1.0], [15700.0, 1.0], [16300.0, 3.0], [16100.0, 1.0], [15900.0, 1.0], [16000.0, 1.0], [16400.0, 3.0], [16600.0, 4.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 16600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 47.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1953.0, "series": [{"data": [[1.0, 47.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 1953.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 88.64204545454548, "minX": 1.54960836E12, "maxY": 858.6288377192988, "series": [{"data": [[1.54960842E12, 88.64204545454548], [1.54960836E12, 858.6288377192988]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 528.5, "minX": 1.0, "maxY": 16676.0, "series": [{"data": [[4.0, 13541.0], [5.0, 13360.0], [7.0, 14943.0], [8.0, 13584.0], [11.0, 15143.0], [12.0, 13731.0], [13.0, 13106.0], [15.0, 13402.5], [16.0, 13621.0], [17.0, 13767.0], [18.0, 13123.0], [19.0, 13748.0], [21.0, 14520.5], [22.0, 13166.0], [23.0, 13733.0], [24.0, 13508.0], [25.0, 13027.0], [26.0, 13407.0], [27.0, 13442.0], [29.0, 13183.0], [30.0, 13634.0], [31.0, 13718.0], [33.0, 13471.0], [32.0, 16676.0], [35.0, 13497.0], [34.0, 13462.0], [37.0, 13601.0], [36.0, 13639.0], [39.0, 13286.0], [38.0, 13520.0], [41.0, 13102.0], [43.0, 13039.0], [42.0, 13418.0], [45.0, 13738.0], [44.0, 13359.0], [47.0, 16662.0], [46.0, 13374.0], [49.0, 13586.0], [48.0, 13636.0], [51.0, 13619.0], [50.0, 14565.0], [53.0, 13517.0], [52.0, 14648.0], [54.0, 13560.0], [56.0, 13202.5], [59.0, 13015.0], [58.0, 13140.0], [61.0, 16600.0], [60.0, 12971.0], [63.0, 12997.0], [67.0, 13018.0], [66.0, 13277.5], [64.0, 13030.0], [71.0, 15066.0], [70.0, 12980.0], [69.0, 13043.0], [68.0, 13065.0], [75.0, 13358.0], [74.0, 13625.0], [73.0, 13680.0], [72.0, 13243.0], [79.0, 13284.0], [78.0, 13635.0], [77.0, 13265.0], [83.0, 12991.0], [82.0, 15968.0], [81.0, 13342.0], [80.0, 13405.0], [87.0, 13470.0], [86.0, 13224.0], [85.0, 13581.0], [84.0, 13444.0], [91.0, 13407.0], [90.0, 12987.0], [89.0, 13021.0], [88.0, 13155.0], [95.0, 12991.0], [94.0, 13650.0], [93.0, 13284.0], [92.0, 13216.0], [99.0, 13420.0], [98.0, 13967.0], [97.0, 13814.0], [96.0, 16358.0], [103.0, 13346.0], [102.0, 13539.0], [101.0, 13943.0], [100.0, 13461.0], [105.0, 528.5], [107.0, 7052.0], [106.0, 14113.0], [104.0, 13258.0], [111.0, 12905.0], [110.0, 13022.0], [109.0, 13700.0], [108.0, 13482.0], [115.0, 13181.0], [114.0, 12874.0], [113.0, 12996.0], [112.0, 13341.0], [119.0, 618.0], [118.0, 15765.0], [117.0, 13201.0], [116.0, 13352.0], [123.0, 12826.0], [122.0, 13969.0], [121.0, 14706.0], [120.0, 13305.0], [127.0, 7824.0], [126.0, 12819.0], [125.0, 15334.0], [124.0, 14271.0], [128.0, 4801.0], [131.0, 8174.0], [132.0, 681.6666666666666], [133.0, 9931.666666666666], [135.0, 6841.5], [134.0, 13475.0], [130.0, 13710.0], [129.0, 13495.0], [139.0, 5135.333333333333], [138.0, 8535.5], [140.0, 6790.0], [143.0, 13041.0], [142.0, 13282.0], [141.0, 13224.0], [137.0, 13120.0], [136.0, 12925.0], [145.0, 2941.666666666667], [146.0, 8633.5], [151.0, 9566.333333333334], [149.0, 13376.0], [148.0, 13190.0], [147.0, 15836.0], [144.0, 13167.0], [152.0, 8619.5], [154.0, 3313.0], [155.0, 4885.0], [156.0, 7037.0], [159.0, 14500.0], [158.0, 13446.0], [157.0, 12958.0], [153.0, 12804.0], [160.0, 957.0], [167.0, 14231.0], [165.0, 16390.0], [164.0, 15423.0], [163.0, 13767.0], [162.0, 13252.0], [161.0, 13689.5], [170.0, 7627.0], [172.0, 6822.5], [174.0, 14920.0], [173.0, 13349.0], [171.0, 13250.0], [169.0, 14507.0], [168.0, 14607.0], [177.0, 5193.666666666667], [176.0, 7610.5], [179.0, 985.5], [178.0, 4923.333333333334], [181.0, 8352.0], [183.0, 6994.5], [182.0, 12403.0], [180.0, 12834.5], [186.0, 8288.0], [187.0, 7232.5], [191.0, 12093.0], [190.0, 12572.0], [189.0, 13916.0], [188.0, 12778.0], [185.0, 14830.0], [184.0, 14157.0], [199.0, 15406.0], [198.0, 12374.0], [197.0, 12857.0], [196.0, 12303.0], [195.0, 12496.0], [194.0, 12443.0], [193.0, 12789.0], [192.0, 12134.0], [207.0, 12816.0], [206.0, 15236.0], [205.0, 12870.0], [204.0, 12180.0], [203.0, 12230.0], [202.0, 12442.0], [200.0, 12568.0], [215.0, 14631.0], [214.0, 14990.0], [213.0, 14267.0], [212.0, 14256.0], [211.0, 14773.0], [210.0, 12905.0], [209.0, 13236.0], [208.0, 14174.0], [223.0, 15454.0], [222.0, 12280.0], [221.0, 14504.0], [220.0, 15481.0], [219.0, 12526.0], [218.0, 12525.0], [217.0, 14634.0], [216.0, 13694.0], [231.0, 14908.0], [230.0, 14759.0], [229.0, 12683.0], [228.0, 11909.0], [227.0, 12740.0], [226.0, 11788.0], [225.0, 12377.0], [224.0, 12361.0], [239.0, 13576.0], [238.0, 13742.5], [236.0, 14514.0], [235.0, 15161.0], [234.0, 13703.0], [233.0, 15294.0], [232.0, 14109.0], [247.0, 12605.0], [246.0, 12252.0], [245.0, 15208.0], [244.0, 15357.0], [243.0, 15167.0], [242.0, 13574.0], [241.0, 14914.0], [240.0, 12193.0], [255.0, 13551.0], [254.0, 12684.0], [253.0, 11941.0], [252.0, 12897.5], [250.0, 15062.0], [249.0, 13086.0], [248.0, 13040.0], [270.0, 11755.0], [271.0, 12853.0], [269.0, 13593.0], [268.0, 13024.0], [267.0, 15258.0], [266.0, 12405.0], [265.0, 11736.0], [264.0, 13264.0], [263.0, 13301.0], [257.0, 14734.0], [256.0, 12615.0], [259.0, 13633.0], [258.0, 13406.0], [262.0, 13338.0], [260.0, 12236.0], [286.0, 12701.0], [287.0, 12179.0], [285.0, 14471.0], [284.0, 13633.0], [283.0, 12998.0], [282.0, 14569.0], [281.0, 12884.5], [279.0, 14807.0], [273.0, 12582.0], [272.0, 14915.0], [275.0, 12300.0], [274.0, 14066.0], [278.0, 12564.0], [277.0, 13309.0], [276.0, 11794.0], [302.0, 11735.0], [303.0, 15069.0], [301.0, 12316.0], [300.0, 11966.0], [299.0, 13082.0], [298.0, 13545.0], [297.0, 12469.0], [296.0, 12719.0], [295.0, 12851.0], [289.0, 13148.0], [288.0, 15163.0], [291.0, 14213.0], [290.0, 14619.0], [294.0, 13263.0], [293.0, 13159.0], [292.0, 12785.0], [318.0, 11520.0], [319.0, 13117.0], [317.0, 13041.0], [316.0, 13716.0], [315.0, 12174.0], [314.0, 14623.0], [313.0, 14937.0], [312.0, 14645.0], [311.0, 13864.5], [305.0, 12414.0], [304.0, 13871.0], [307.0, 11783.0], [306.0, 15069.0], [309.0, 12922.0], [308.0, 11559.0], [333.0, 14875.0], [334.0, 12798.0], [332.0, 11844.0], [323.0, 11493.0], [322.0, 12478.0], [321.0, 12276.0], [320.0, 12608.0], [331.0, 13146.0], [330.0, 12074.0], [329.0, 14727.0], [328.0, 13682.0], [327.0, 14038.5], [325.0, 12537.0], [324.0, 12699.0], [349.0, 13938.0], [343.0, 5709.666666666666], [341.0, 5573.333333333334], [340.0, 13701.0], [342.0, 12101.0], [344.0, 6931.0], [348.0, 8996.0], [339.0, 13791.0], [338.0, 13752.0], [337.0, 12228.0], [336.0, 13411.0], [351.0, 12602.0], [350.0, 11967.0], [346.0, 13411.0], [345.0, 12412.0], [366.0, 12561.5], [353.0, 7879.0], [367.0, 11872.0], [364.0, 12385.0], [355.0, 14331.0], [354.0, 12910.0], [363.0, 11672.0], [362.0, 14075.0], [361.0, 12286.0], [360.0, 13481.0], [359.0, 12396.0], [352.0, 12686.0], [358.0, 11234.0], [357.0, 11163.0], [356.0, 12811.0], [382.0, 12194.0], [368.0, 5070.0], [369.0, 12061.0], [371.0, 12629.0], [370.0, 12820.0], [375.0, 14446.0], [374.0, 13485.0], [373.0, 11851.0], [372.0, 14449.0], [383.0, 12192.0], [381.0, 14453.0], [380.0, 11866.0], [379.0, 12869.0], [378.0, 11056.0], [377.0, 12834.0], [376.0, 13008.0], [399.0, 14306.0], [388.0, 4400.0], [390.0, 12293.0], [389.0, 10971.0], [392.0, 6902.0], [398.0, 14098.0], [397.0, 11943.0], [396.0, 11734.0], [387.0, 12119.0], [386.0, 12149.0], [385.0, 14351.0], [384.0, 12279.0], [391.0, 11937.0], [395.0, 14396.0], [394.0, 11991.0], [393.0, 12008.0], [414.0, 11828.0], [408.0, 7003.5], [406.0, 5996.0], [405.0, 14208.0], [404.0, 13770.0], [407.0, 12153.0], [401.0, 11535.0], [400.0, 13454.0], [403.0, 14329.0], [402.0, 12519.0], [409.0, 7471.0], [411.0, 7171.5], [415.0, 13543.0], [413.0, 12501.0], [412.0, 11703.0], [410.0, 12837.0], [431.0, 12288.0], [422.0, 5812.0], [421.0, 12538.0], [420.0, 11964.0], [427.0, 6019.666666666666], [430.0, 11206.0], [429.0, 12958.0], [428.0, 11358.0], [419.0, 12164.0], [418.0, 12934.0], [417.0, 12737.0], [416.0, 13064.0], [423.0, 11701.0], [426.0, 12030.0], [425.0, 11947.0], [424.0, 13044.0], [446.0, 13513.0], [447.0, 11580.0], [445.0, 12440.0], [444.0, 10432.0], [443.0, 13909.0], [442.0, 12313.0], [441.0, 11698.0], [440.0, 13466.0], [439.0, 11227.0], [433.0, 12410.0], [432.0, 12175.0], [435.0, 10585.0], [434.0, 13635.0], [438.0, 12393.0], [437.0, 11237.0], [436.0, 11684.0], [462.0, 11076.0], [450.0, 7153.0], [449.0, 12068.0], [448.0, 11514.0], [451.0, 10939.0], [455.0, 12883.0], [454.0, 11172.0], [453.0, 13832.0], [452.0, 11501.0], [463.0, 13746.0], [461.0, 11910.0], [460.0, 12192.0], [459.0, 13429.0], [458.0, 11711.0], [457.0, 11170.0], [456.0, 11265.0], [478.0, 12023.0], [471.0, 6636.0], [465.0, 12415.0], [464.0, 11185.0], [467.0, 11084.0], [466.0, 10303.0], [479.0, 11699.0], [477.0, 11172.0], [476.0, 11684.0], [474.0, 11796.0], [473.0, 11507.0], [472.0, 12413.0], [470.0, 13651.0], [469.0, 12883.0], [468.0, 10853.0], [494.0, 12647.0], [482.0, 6408.5], [487.0, 7060.0], [481.0, 12532.5], [486.0, 12334.0], [485.0, 11582.0], [484.0, 13514.0], [488.0, 7602.5], [489.0, 2424.0], [495.0, 6762.5], [493.0, 12315.0], [492.0, 12585.0], [483.0, 12516.0], [491.0, 12043.0], [490.0, 10396.0], [510.0, 10388.0], [496.0, 6881.0], [497.0, 11741.0], [499.0, 12667.0], [498.0, 11900.0], [503.0, 13409.0], [502.0, 10989.0], [501.0, 12910.0], [500.0, 11249.0], [511.0, 12015.0], [509.0, 12641.0], [508.0, 13193.0], [507.0, 11353.0], [506.0, 10907.0], [505.0, 10889.0], [504.0, 11274.0], [536.0, 10913.0], [540.0, 6526.0], [532.0, 7694.5], [520.0, 7562.5], [522.0, 10411.0], [521.0, 10859.0], [524.0, 12743.0], [523.0, 11440.0], [527.0, 11234.0], [513.0, 12145.0], [515.0, 10647.0], [514.0, 9823.0], [517.0, 12650.0], [516.0, 12634.0], [519.0, 10401.0], [518.0, 13201.0], [526.0, 11465.0], [537.0, 12037.0], [535.0, 6969.5], [534.0, 10322.0], [533.0, 13064.0], [543.0, 10879.0], [529.0, 11366.0], [528.0, 12904.0], [531.0, 10739.0], [530.0, 9683.0], [542.0, 10797.0], [541.0, 10678.0], [539.0, 12640.0], [538.0, 10828.0], [570.0, 10356.0], [574.0, 6670.5], [546.0, 7775.0], [551.0, 7624.0], [550.0, 11053.0], [549.0, 11221.0], [548.0, 11344.0], [547.0, 11473.0], [569.0, 10773.0], [568.0, 10881.0], [571.0, 11923.0], [553.0, 6248.5], [552.0, 12409.0], [555.0, 10932.0], [554.0, 12058.0], [557.0, 12094.0], [556.0, 12354.0], [558.0, 7447.0], [559.0, 12787.0], [545.0, 12361.0], [544.0, 12547.0], [562.0, 7586.5], [566.0, 6844.5], [565.0, 12794.0], [564.0, 11353.0], [563.0, 10967.0], [567.0, 12387.0], [575.0, 11060.0], [561.0, 11274.0], [560.0, 12490.0], [573.0, 10285.0], [572.0, 9977.0], [600.0, 5874.0], [576.0, 7545.5], [579.0, 10905.5], [577.0, 11883.0], [581.0, 6928.0], [583.0, 11225.0], [582.0, 11653.0], [580.0, 7101.0], [591.0, 7295.0], [590.0, 10768.0], [589.0, 11459.0], [588.0, 9771.0], [587.0, 9863.0], [586.0, 9187.0], [585.0, 11871.0], [584.0, 12653.0], [606.0, 6849.0], [607.0, 6967.5], [593.0, 11584.0], [592.0, 11730.0], [595.0, 11072.0], [594.0, 12263.0], [597.0, 11158.0], [596.0, 12519.0], [599.0, 11893.0], [598.0, 10789.0], [605.0, 12465.0], [604.0, 11528.0], [603.0, 10791.0], [602.0, 9589.0], [601.0, 10964.0], [636.0, 11103.0], [617.0, 7422.0], [616.0, 10576.0], [618.0, 6436.0], [639.0, 11820.0], [624.0, 10524.0], [626.0, 11229.0], [625.0, 10928.0], [629.0, 9506.0], [628.0, 12064.0], [631.0, 10308.0], [630.0, 11226.0], [638.0, 10713.0], [637.0, 11276.0], [635.0, 11710.0], [634.0, 11783.0], [633.0, 9886.0], [632.0, 9807.0], [623.0, 11427.0], [609.0, 12085.0], [608.0, 11046.0], [611.0, 12390.0], [610.0, 11588.0], [613.0, 11691.0], [612.0, 11969.0], [615.0, 9855.0], [614.0, 11950.0], [622.0, 11057.0], [621.0, 11148.0], [620.0, 10168.5], [664.0, 10594.0], [670.0, 9337.0], [666.0, 6416.5], [665.0, 5252.0], [671.0, 9796.0], [657.0, 10910.0], [656.0, 11708.0], [659.0, 11450.0], [658.0, 11469.0], [661.0, 11919.0], [660.0, 11932.0], [669.0, 10687.0], [668.0, 10807.0], [667.0, 10066.0], [655.0, 11923.0], [641.0, 10611.0], [640.0, 10942.0], [643.0, 10708.0], [642.0, 10818.0], [645.0, 9927.0], [644.0, 10501.0], [647.0, 10655.0], [646.0, 11418.0], [654.0, 11709.0], [653.0, 9526.0], [652.0, 11982.0], [651.0, 10089.0], [650.0, 9619.0], [649.0, 11337.0], [648.0, 11925.0], [663.0, 11892.0], [662.0, 11092.0], [696.0, 10994.0], [702.0, 11583.0], [674.0, 6242.5], [673.0, 10708.0], [672.0, 11619.0], [675.0, 10359.0], [677.0, 11515.0], [676.0, 11813.0], [679.0, 10585.0], [678.0, 10459.0], [687.0, 10954.0], [686.0, 11705.0], [685.0, 10645.0], [684.0, 10781.0], [683.0, 9077.0], [682.0, 8310.0], [681.0, 8294.0], [680.0, 10120.0], [697.0, 8781.0], [690.0, 4833.0], [691.0, 3090.0], [693.0, 10940.0], [692.0, 10405.0], [695.0, 5849.0], [694.0, 11222.0], [698.0, 5036.333333333333], [703.0, 7338.5], [689.0, 11255.0], [688.0, 10459.0], [701.0, 9978.0], [700.0, 9387.5], [728.0, 7190.5], [718.0, 7146.5], [719.0, 10664.0], [711.0, 9257.0], [710.0, 10261.0], [709.0, 10131.0], [708.0, 10592.0], [707.0, 10244.0], [706.0, 11430.0], [705.0, 9489.0], [704.0, 11562.0], [717.0, 6359.5], [716.0, 6517.0], [715.0, 8956.0], [714.0, 9468.0], [713.0, 10892.0], [712.0, 10753.0], [723.0, 6799.0], [725.0, 10263.0], [724.0, 11339.0], [727.0, 11339.0], [726.0, 11278.0], [722.0, 8333.333333333334], [735.0, 9020.0], [720.0, 8795.0], [734.0, 8636.0], [733.0, 8435.0], [732.0, 11315.0], [731.0, 9453.0], [730.0, 10311.0], [729.0, 11346.0], [764.0, 8876.0], [740.0, 6141.0], [739.0, 9935.0], [738.0, 11246.0], [737.0, 9851.0], [736.0, 11234.0], [741.0, 8752.0], [743.0, 10952.0], [742.0, 11915.0], [761.0, 11061.0], [760.0, 8171.0], [744.0, 5533.0], [746.0, 9849.0], [745.0, 9516.0], [748.0, 8986.0], [747.0, 11126.0], [750.0, 10097.0], [749.0, 8871.0], [751.0, 6926.5], [767.0, 10944.0], [753.0, 9176.0], [752.0, 9690.0], [755.0, 10368.0], [754.0, 11108.0], [757.0, 10437.0], [756.0, 10531.0], [759.0, 9628.0], [758.0, 10545.0], [766.0, 9435.0], [765.0, 8371.0], [763.0, 9767.0], [762.0, 9384.0], [793.0, 5973.0], [770.0, 6740.5], [775.0, 6134.0], [774.0, 10887.0], [773.0, 9578.0], [772.0, 10631.0], [771.0, 10089.0], [792.0, 10027.0], [779.0, 5416.333333333333], [778.0, 9950.0], [777.0, 8422.0], [776.0, 8012.0], [781.0, 10179.0], [780.0, 7993.0], [783.0, 8437.0], [769.0, 10940.0], [768.0, 10749.0], [782.0, 8796.0], [790.0, 6480.0], [789.0, 9459.0], [788.0, 7297.0], [787.0, 8615.0], [786.0, 9304.0], [785.0, 10540.0], [784.0, 8716.0], [791.0, 8996.0], [799.0, 7188.0], [798.0, 10238.0], [797.0, 9949.0], [796.0, 9771.0], [795.0, 8940.0], [794.0, 9735.0], [826.0, 10099.0], [830.0, 10436.0], [803.0, 6442.5], [802.0, 6193.0], [801.0, 8983.0], [800.0, 9280.0], [805.0, 6587.0], [804.0, 10168.0], [807.0, 9712.0], [806.0, 9941.0], [825.0, 9369.0], [824.0, 10407.0], [827.0, 7710.0], [810.0, 5827.0], [809.0, 10455.0], [808.0, 8216.0], [812.0, 10270.0], [811.0, 10559.0], [814.0, 9757.0], [813.0, 9515.0], [815.0, 10312.0], [821.0, 6931.0], [823.0, 6722.5], [822.0, 10480.0], [831.0, 5830.5], [816.0, 9182.0], [818.0, 8403.0], [817.0, 9308.0], [820.0, 8723.0], [819.0, 10476.0], [829.0, 8900.0], [828.0, 10173.0], [839.0, 6723.0], [834.0, 5309.0], [833.0, 10418.0], [832.0, 9015.0], [835.0, 10391.0], [847.0, 9961.0], [846.0, 9408.0], [845.0, 10306.0], [844.0, 9818.0], [843.0, 9362.0], [842.0, 9787.0], [841.0, 9450.0], [840.0, 10359.0], [836.0, 6753.5], [837.0, 6660.5], [838.0, 10091.0], [849.0, 3682.0], [848.0, 8802.0], [851.0, 10268.0], [850.0, 9441.5], [853.0, 9064.0], [852.0, 9639.0], [855.0, 9130.0], [854.0, 8082.0], [857.0, 6142.0], [856.0, 8252.0], [858.0, 8966.0], [859.0, 6173.5], [863.0, 9405.0], [862.0, 9903.0], [861.0, 9319.0], [860.0, 10112.0], [893.0, 9817.0], [869.0, 6328.0], [864.0, 6850.5], [866.0, 10019.0], [865.0, 9268.0], [868.0, 5480.0], [867.0, 5251.0], [872.0, 6258.5], [874.0, 9245.0], [873.0, 9502.0], [876.0, 8686.0], [875.0, 9975.0], [878.0, 9821.0], [877.0, 8432.0], [879.0, 11106.0], [882.0, 6902.0], [881.0, 8633.0], [880.0, 9877.0], [883.0, 11279.0], [885.0, 9803.0], [884.0, 9846.0], [887.0, 9750.0], [886.0, 8434.0], [895.0, 8920.0], [894.0, 9770.0], [892.0, 9804.0], [891.0, 9753.0], [890.0, 11837.0], [889.0, 11656.0], [888.0, 8523.0], [871.0, 9114.0], [870.0, 9018.0], [903.0, 6378.5], [899.0, 4555.0], [902.0, 5305.0], [901.0, 5551.2], [904.0, 5490.4], [905.0, 4817.6], [906.0, 6229.5], [927.0, 8704.0], [913.0, 8871.0], [912.0, 8849.0], [915.0, 9949.0], [914.0, 8878.0], [917.0, 10163.0], [916.0, 10168.0], [919.0, 10369.0], [918.0, 8113.0], [926.0, 9817.0], [925.0, 10691.0], [924.0, 8579.0], [923.0, 7442.0], [922.0, 8617.0], [921.0, 10825.0], [920.0, 8606.0], [900.0, 7293.666666666667], [898.0, 5300.25], [897.0, 9821.0], [896.0, 9400.0], [911.0, 8876.0], [910.0, 8007.0], [908.0, 4598.88888888889], [909.0, 6285.5], [907.0, 5533.25], [957.0, 6291.5], [948.0, 5850.5], [947.0, 9403.0], [946.0, 7630.0], [945.0, 10239.0], [944.0, 7236.0], [949.0, 8354.0], [951.0, 9254.0], [950.0, 9145.0], [959.0, 8925.0], [958.0, 8272.0], [956.0, 8292.0], [955.0, 8977.0], [954.0, 9753.0], [953.0, 10199.0], [952.0, 9049.0], [935.0, 9416.0], [934.0, 7995.0], [933.0, 8108.0], [932.0, 10274.0], [931.0, 8521.0], [930.0, 9763.0], [929.0, 8688.0], [928.0, 9741.0], [943.0, 8951.0], [942.0, 9044.0], [941.0, 8502.0], [940.0, 8077.0], [939.0, 9404.0], [938.0, 8493.0], [937.0, 8033.0], [936.0, 8056.0], [986.0, 6524.5], [960.0, 6107.0], [965.0, 5645.0], [964.0, 8705.0], [963.0, 8052.0], [962.0, 8457.0], [967.0, 10146.0], [966.0, 9206.0], [985.0, 9542.0], [984.0, 10048.0], [971.0, 6065.0], [970.0, 8079.0], [969.0, 8201.0], [968.0, 9637.0], [973.0, 9129.0], [972.0, 8748.0], [975.0, 7273.0], [974.0, 9391.0], [983.0, 5698.333333333333], [982.0, 5160.333333333333], [981.0, 5691.0], [980.0, 6796.0], [979.0, 8116.0], [978.0, 6919.0], [977.0, 9334.0], [976.0, 9130.0], [990.0, 6119.0], [989.0, 9784.0], [988.0, 7972.0], [987.0, 6522.0], [991.0, 9589.0], [998.0, 4857.75], [996.0, 5048.666666666667], [994.0, 5903.333333333333], [993.0, 9492.0], [992.0, 8560.0], [995.0, 7598.0], [1007.0, 9099.0], [1006.0, 9361.0], [1005.0, 8820.0], [1004.0, 8969.0], [1003.0, 9620.0], [997.0, 5557.0], [1002.0, 5020.333333333333], [1001.0, 5412.0], [1000.0, 6969.0], [1015.0, 5037.0], [1014.0, 6418.0], [1021.0, 6973.0], [1020.0, 8838.0], [1019.0, 9394.0], [1018.0, 8799.0], [1017.0, 8289.0], [1016.0, 8949.0], [999.0, 9021.0], [1022.0, 8462.0], [1009.0, 9747.0], [1008.0, 7871.0], [1011.0, 8481.0], [1010.0, 9075.0], [1013.0, 9230.0], [1012.0, 7864.0], [1030.0, 5795.0], [1038.0, 6659.5], [1026.0, 6972.0], [1024.0, 8119.5], [1052.0, 6756.5], [1050.0, 8231.5], [1054.0, 6765.0], [1042.0, 9014.0], [1044.0, 9570.0], [1046.0, 8877.0], [1048.0, 6252.0], [1028.0, 4861.25], [1032.0, 9026.0], [1034.0, 9596.0], [1036.0, 9737.0], [1072.0, 6117.5], [1074.0, 5369.666666666667], [1076.0, 6312.5], [1078.0, 5873.666666666667], [1080.0, 6446.0], [1086.0, 4835.75], [1084.0, 8922.0], [1082.0, 8228.0], [1056.0, 8629.0], [1058.0, 5871.666666666667], [1060.0, 5195.333333333333], [1062.0, 8293.0], [1064.0, 8964.0], [1066.0, 8233.0], [1070.0, 8268.0], [1040.0, 5234.5], [1094.0, 9045.0], [1100.0, 5228.5], [1090.0, 6014.0], [1088.0, 9239.0], [1092.0, 8191.0], [1118.0, 7125.0], [1116.0, 8054.0], [1110.0, 6667.0], [1108.0, 7749.0], [1112.0, 8727.0], [1114.0, 6163.5], [1098.0, 5540.0], [1096.0, 6617.0], [1102.0, 7705.0], [1136.0, 5437.6], [1138.0, 5446.0], [1140.0, 5746.333333333333], [1142.0, 8645.0], [1144.0, 4735.0], [1146.0, 5817.666666666667], [1120.0, 7927.0], [1150.0, 8005.0], [1148.0, 6216.666666666667], [1124.0, 5788.5], [1128.0, 5508.666666666667], [1130.0, 4741.5], [1132.0, 4882.666666666667], [1134.0, 4850.357142857143], [1126.0, 8365.0], [1122.0, 6890.0], [1104.0, 7914.0], [1106.0, 6148.0], [1154.0, 7707.0], [1152.0, 5023.285714285715], [1182.0, 7558.0], [1180.0, 6480.0], [1168.0, 7992.0], [1170.0, 6356.0], [1172.0, 8421.0], [1174.0, 8251.0], [1176.0, 7623.0], [1178.0, 5979.5], [1156.0, 5663.0], [1158.0, 6255.5], [1162.0, 5191.2], [1166.0, 6233.0], [1184.0, 5235.11111111111], [1214.0, 7897.0], [1210.0, 6794.0], [1208.0, 7887.0], [1212.0, 9433.0], [1202.0, 8165.0], [1204.0, 6806.0], [1200.0, 6024.0], [1186.0, 6733.0], [1188.0, 5204.857142857143], [1190.0, 5374.4], [1198.0, 7196.0], [1196.0, 6803.0], [1194.0, 6911.5], [1192.0, 8542.0], [1164.0, 8462.0], [1160.0, 5090.0], [1220.0, 6261.0], [1216.0, 7739.0], [1246.0, 6655.0], [1244.0, 6653.0], [1242.0, 5329.6], [1240.0, 6275.333333333333], [1238.0, 6814.0], [1234.0, 7205.0], [1236.0, 5997.0], [1232.0, 5438.777777777777], [1218.0, 5694.75], [1224.0, 5455.0], [1222.0, 8155.0], [1226.0, 8000.0], [1228.0, 6163.666666666667], [1230.0, 7205.0], [1248.0, 6806.0], [1278.0, 6529.0], [1276.0, 7403.0], [1274.0, 6646.0], [1272.0, 7389.0], [1270.0, 6254.0], [1268.0, 7671.0], [1266.0, 6436.0], [1264.0, 7935.0], [1250.0, 7522.0], [1252.0, 7627.0], [1254.0, 6863.0], [1256.0, 6452.0], [1258.0, 8074.0], [1260.0, 6552.0], [1262.0, 6511.0], [1336.0, 8215.0], [1332.0, 6206.0], [1340.0, 7078.0], [1312.0, 6424.0], [1314.0, 6182.5], [1316.0, 7676.0], [1318.0, 7312.0], [1320.0, 6177.0], [1322.0, 7173.0], [1324.0, 6204.0], [1326.0, 5708.0], [1342.0, 6117.0], [1338.0, 7128.0], [1334.0, 6960.0], [1330.0, 7295.0], [1328.0, 8506.0], [1280.0, 7190.0], [1282.0, 7640.0], [1284.0, 7521.0], [1286.0, 6843.0], [1288.0, 6433.0], [1290.0, 6439.0], [1292.0, 6618.0], [1294.0, 7244.0], [1310.0, 6401.0], [1308.0, 6742.0], [1306.0, 6667.0], [1304.0, 7216.0], [1302.0, 6398.0], [1300.0, 7130.0], [1298.0, 6735.0], [1296.0, 7643.0], [1400.0, 6166.0], [1396.0, 7436.0], [1404.0, 7321.0], [1376.0, 5417.0], [1378.0, 6574.0], [1380.0, 7576.0], [1382.0, 7589.0], [1384.0, 6463.0], [1386.0, 6573.0], [1388.0, 7579.0], [1390.0, 5758.0], [1406.0, 5428.0], [1402.0, 7174.0], [1398.0, 6278.0], [1394.0, 6336.0], [1392.0, 5244.0], [1344.0, 6708.0], [1346.0, 6947.0], [1348.0, 6575.0], [1350.0, 6809.0], [1352.0, 6952.0], [1354.0, 5975.0], [1356.0, 6853.0], [1358.0, 6523.0], [1374.0, 5386.0], [1372.0, 6331.0], [1370.0, 6719.0], [1368.0, 5050.0], [1366.0, 6368.0], [1364.0, 7761.0], [1362.0, 6812.0], [1360.0, 6561.0], [1416.0, 6341.7692307692305], [1420.0, 6336.5], [1422.0, 6196.0], [1418.0, 6339.5], [1414.0, 6274.0], [1412.0, 6243.75], [1410.0, 6411.8], [1408.0, 7023.0], [1426.0, 6463.0], [1424.0, 5711.5], [1029.0, 6560.0], [1025.0, 5962.5], [1051.0, 6646.0], [1053.0, 7204.0], [1055.0, 5789.666666666667], [1043.0, 5400.0], [1045.0, 7587.0], [1047.0, 8546.0], [1027.0, 6438.0], [1031.0, 8507.0], [1033.0, 9378.0], [1035.0, 9183.0], [1037.0, 8150.0], [1039.0, 6084.0], [1075.0, 5179.0], [1077.0, 8251.0], [1079.0, 9299.0], [1085.0, 7348.0], [1083.0, 8897.0], [1081.0, 8409.0], [1087.0, 6571.0], [1073.0, 5552.333333333333], [1057.0, 7027.0], [1059.0, 6584.0], [1061.0, 6257.5], [1063.0, 6076.666666666667], [1065.0, 8764.0], [1069.0, 9232.0], [1067.0, 7472.0], [1071.0, 8016.0], [1041.0, 6214.0], [1095.0, 6046.0], [1093.0, 6162.666666666667], [1089.0, 8963.0], [1091.0, 7317.0], [1119.0, 8563.0], [1117.0, 7697.0], [1115.0, 9147.0], [1109.0, 8000.0], [1111.0, 7110.0], [1113.0, 5307.5], [1099.0, 8324.0], [1097.0, 6492.5], [1101.0, 5606.333333333333], [1103.0, 8932.0], [1139.0, 5252.25], [1141.0, 5936.5], [1143.0, 6069.5], [1145.0, 5414.0], [1147.0, 5664.0], [1149.0, 5937.0], [1151.0, 5586.25], [1137.0, 6214.0], [1121.0, 6386.0], [1129.0, 4846.0], [1133.0, 4760.111111111111], [1135.0, 5657.25], [1131.0, 5494.0], [1127.0, 4912.0], [1125.0, 7892.0], [1123.0, 6156.5], [1105.0, 5960.0], [1107.0, 5714.75], [1161.0, 5794.8], [1157.0, 7125.5], [1153.0, 5538.4], [1181.0, 5465.0], [1183.0, 5198.333333333333], [1179.0, 6237.333333333333], [1169.0, 5599.0], [1171.0, 7966.0], [1173.0, 8434.0], [1175.0, 7097.0], [1177.0, 7110.0], [1155.0, 8021.0], [1159.0, 5808.666666666667], [1163.0, 5311.888888888889], [1215.0, 7437.0], [1211.0, 6565.0], [1209.0, 8259.0], [1213.0, 5597.75], [1203.0, 5754.5], [1205.0, 8342.0], [1207.0, 6107.0], [1167.0, 7877.0], [1201.0, 5920.333333333333], [1185.0, 5102.333333333333], [1189.0, 5494.0], [1191.0, 5972.0], [1197.0, 5939.5], [1199.0, 7429.0], [1195.0, 6194.666666666667], [1193.0, 7769.0], [1187.0, 5620.0], [1165.0, 6154.5], [1219.0, 5823.5], [1217.0, 5550.333333333333], [1247.0, 7167.0], [1245.0, 6739.0], [1243.0, 6353.75], [1241.0, 5995.25], [1239.0, 6350.5], [1235.0, 6006.0], [1237.0, 6160.6], [1233.0, 6382.0], [1223.0, 6392.5], [1221.0, 8100.0], [1227.0, 6712.666666666667], [1225.0, 7455.0], [1229.0, 5768.166666666666], [1231.0, 6671.5], [1249.0, 6720.5], [1279.0, 7623.0], [1277.0, 6697.0], [1275.0, 7127.0], [1273.0, 7861.0], [1271.0, 6579.0], [1269.0, 6483.0], [1267.0, 7332.0], [1265.0, 7874.0], [1251.0, 6200.0], [1253.0, 7348.0], [1255.0, 7734.0], [1257.0, 6484.0], [1259.0, 6763.0], [1261.0, 7021.0], [1263.0, 6586.0], [1341.0, 6542.0], [1343.0, 8176.0], [1315.0, 7430.0], [1317.0, 6762.0], [1319.0, 6046.0], [1321.0, 5899.0], [1323.0, 6282.0], [1325.0, 5888.0], [1327.0, 6267.0], [1339.0, 6168.0], [1337.0, 5722.0], [1335.0, 7284.0], [1333.0, 6563.0], [1331.0, 6482.0], [1329.0, 7429.0], [1311.0, 7390.0], [1281.0, 7632.0], [1283.0, 7224.0], [1285.0, 7133.0], [1287.0, 6117.0], [1289.0, 6473.0], [1291.0, 7629.0], [1293.0, 7037.0], [1295.0, 6221.0], [1309.0, 6952.0], [1307.0, 7563.0], [1305.0, 6018.0], [1303.0, 6076.0], [1301.0, 6031.0], [1299.0, 7330.0], [1297.0, 7219.0], [1405.0, 7335.0], [1407.0, 4595.0], [1377.0, 5995.0], [1379.0, 5652.0], [1381.0, 6415.0], [1383.0, 5122.0], [1385.0, 7482.0], [1387.0, 6194.0], [1389.0, 7497.0], [1391.0, 7810.0], [1403.0, 6065.0], [1401.0, 5980.0], [1399.0, 6361.0], [1397.0, 7637.0], [1395.0, 7307.0], [1393.0, 5549.0], [1375.0, 5765.0], [1345.0, 7014.0], [1347.0, 7490.0], [1349.0, 8036.0], [1351.0, 6259.0], [1353.0, 7961.0], [1355.0, 8080.0], [1357.0, 5382.0], [1359.0, 6366.0], [1373.0, 6612.0], [1371.0, 6483.0], [1369.0, 6573.0], [1367.0, 6186.0], [1365.0, 5999.0], [1363.0, 6151.0], [1361.0, 5463.0], [1417.0, 6025.857142857142], [1421.0, 6464.0], [1423.0, 6913.0], [1419.0, 6181.333333333333], [1415.0, 6483.5], [1413.0, 6439.333333333333], [1411.0, 6706.75], [1409.0, 6093.0], [1427.0, 5867.0], [1425.0, 6466.5], [1.0, 13089.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[790.8700000000007, 8609.889499999996]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1427.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1100.0, "minX": 1.54960836E12, "maxY": 12795.566666666668, "series": [{"data": [[1.54960842E12, 1234.6833333333334], [1.54960836E12, 12795.566666666668]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960842E12, 1100.0], [1.54960836E12, 11400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 8114.820723684209, "minX": 1.54960836E12, "maxY": 13740.60227272728, "series": [{"data": [[1.54960842E12, 13740.60227272728], [1.54960836E12, 8114.820723684209]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 8114.811951754389, "minX": 1.54960836E12, "maxY": 13740.60227272728, "series": [{"data": [[1.54960842E12, 13740.60227272728], [1.54960836E12, 8114.811951754389]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 65.70175438596493, "minX": 1.54960836E12, "maxY": 499.4715909090909, "series": [{"data": [[1.54960842E12, 499.4715909090909], [1.54960836E12, 65.70175438596493]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 527.0, "minX": 1.54960836E12, "maxY": 16691.0, "series": [{"data": [[1.54960842E12, 16691.0], [1.54960836E12, 15645.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960842E12, 12772.0], [1.54960836E12, 527.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960842E12, 13402.100000000002], [1.54960836E12, 12646.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960842E12, 15480.73], [1.54960836E12, 14931.5]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960842E12, 13900.449999999993], [1.54960836E12, 13518.5]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 8112.5, "minX": 2.0, "maxY": 13425.0, "series": [{"data": [[2.0, 13425.0], [30.0, 8112.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 8112.5, "minX": 2.0, "maxY": 13425.0, "series": [{"data": [[2.0, 13425.0], [30.0, 8112.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960836E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960836E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.933333333333333, "minX": 1.54960836E12, "maxY": 30.4, "series": [{"data": [[1.54960842E12, 2.933333333333333], [1.54960836E12, 30.4]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960842E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.933333333333333, "minX": 1.54960836E12, "maxY": 30.4, "series": [{"data": [[1.54960842E12, 2.933333333333333], [1.54960836E12, 30.4]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960842E12, "title": "Transactions Per Second"}},
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
