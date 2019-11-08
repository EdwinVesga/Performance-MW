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
        data: {"result": {"minY": 531.0, "minX": 0.0, "maxY": 26205.0, "series": [{"data": [[0.0, 531.0], [0.1, 685.0], [0.2, 750.0], [0.3, 821.0], [0.4, 849.0], [0.5, 910.0], [0.6, 968.0], [0.7, 997.0], [0.8, 1024.0], [0.9, 1064.0], [1.0, 1112.0], [1.1, 1143.0], [1.2, 1169.0], [1.3, 1195.0], [1.4, 1229.0], [1.5, 1304.0], [1.6, 1361.0], [1.7, 1507.0], [1.8, 2158.0], [1.9, 2247.0], [2.0, 2315.0], [2.1, 2448.0], [2.2, 2748.0], [2.3, 2840.0], [2.4, 2928.0], [2.5, 3014.0], [2.6, 3126.0], [2.7, 3193.0], [2.8, 3265.0], [2.9, 3312.0], [3.0, 3348.0], [3.1, 3374.0], [3.2, 3400.0], [3.3, 3418.0], [3.4, 3440.0], [3.5, 3454.0], [3.6, 3488.0], [3.7, 3507.0], [3.8, 3530.0], [3.9, 3566.0], [4.0, 3596.0], [4.1, 3618.0], [4.2, 3660.0], [4.3, 3664.0], [4.4, 3667.0], [4.5, 3677.0], [4.6, 3693.0], [4.7, 3726.0], [4.8, 3778.0], [4.9, 3798.0], [5.0, 3810.0], [5.1, 3816.0], [5.2, 3836.0], [5.3, 3861.0], [5.4, 3898.0], [5.5, 3915.0], [5.6, 3931.0], [5.7, 3956.0], [5.8, 3987.0], [5.9, 4000.0], [6.0, 4044.0], [6.1, 4088.0], [6.2, 4115.0], [6.3, 4124.0], [6.4, 4163.0], [6.5, 4175.0], [6.6, 4187.0], [6.7, 4194.0], [6.8, 4203.0], [6.9, 4241.0], [7.0, 4261.0], [7.1, 4279.0], [7.2, 4289.0], [7.3, 4290.0], [7.4, 4317.0], [7.5, 4332.0], [7.6, 4350.0], [7.7, 4369.0], [7.8, 4409.0], [7.9, 4420.0], [8.0, 4424.0], [8.1, 4429.0], [8.2, 4463.0], [8.3, 4493.0], [8.4, 4502.0], [8.5, 4514.0], [8.6, 4530.0], [8.7, 4552.0], [8.8, 4573.0], [8.9, 4582.0], [9.0, 4589.0], [9.1, 4605.0], [9.2, 4631.0], [9.3, 4638.0], [9.4, 4644.0], [9.5, 4670.0], [9.6, 4693.0], [9.7, 4709.0], [9.8, 4727.0], [9.9, 4748.0], [10.0, 4762.0], [10.1, 4769.0], [10.2, 4783.0], [10.3, 4798.0], [10.4, 4801.0], [10.5, 4810.0], [10.6, 4818.0], [10.7, 4853.0], [10.8, 4866.0], [10.9, 4875.0], [11.0, 4890.0], [11.1, 4908.0], [11.2, 4913.0], [11.3, 4929.0], [11.4, 4941.0], [11.5, 4950.0], [11.6, 4955.0], [11.7, 4966.0], [11.8, 4984.0], [11.9, 4987.0], [12.0, 4994.0], [12.1, 4999.0], [12.2, 5015.0], [12.3, 5020.0], [12.4, 5031.0], [12.5, 5055.0], [12.6, 5058.0], [12.7, 5063.0], [12.8, 5077.0], [12.9, 5093.0], [13.0, 5110.0], [13.1, 5125.0], [13.2, 5146.0], [13.3, 5158.0], [13.4, 5176.0], [13.5, 5199.0], [13.6, 5224.0], [13.7, 5237.0], [13.8, 5240.0], [13.9, 5253.0], [14.0, 5267.0], [14.1, 5285.0], [14.2, 5304.0], [14.3, 5323.0], [14.4, 5347.0], [14.5, 5355.0], [14.6, 5385.0], [14.7, 5393.0], [14.8, 5416.0], [14.9, 5421.0], [15.0, 5450.0], [15.1, 5472.0], [15.2, 5495.0], [15.3, 5505.0], [15.4, 5521.0], [15.5, 5567.0], [15.6, 5581.0], [15.7, 5600.0], [15.8, 5626.0], [15.9, 5660.0], [16.0, 5672.0], [16.1, 5726.0], [16.2, 5741.0], [16.3, 5776.0], [16.4, 5800.0], [16.5, 5835.0], [16.6, 5843.0], [16.7, 5858.0], [16.8, 5930.0], [16.9, 5961.0], [17.0, 5979.0], [17.1, 6014.0], [17.2, 6026.0], [17.3, 6041.0], [17.4, 6052.0], [17.5, 6083.0], [17.6, 6097.0], [17.7, 6127.0], [17.8, 6141.0], [17.9, 6165.0], [18.0, 6209.0], [18.1, 6230.0], [18.2, 6251.0], [18.3, 6266.0], [18.4, 6303.0], [18.5, 6324.0], [18.6, 6337.0], [18.7, 6349.0], [18.8, 6369.0], [18.9, 6378.0], [19.0, 6411.0], [19.1, 6442.0], [19.2, 6456.0], [19.3, 6494.0], [19.4, 6499.0], [19.5, 6502.0], [19.6, 6511.0], [19.7, 6551.0], [19.8, 6607.0], [19.9, 6624.0], [20.0, 6646.0], [20.1, 6661.0], [20.2, 6680.0], [20.3, 6720.0], [20.4, 6744.0], [20.5, 6761.0], [20.6, 6800.0], [20.7, 6829.0], [20.8, 6870.0], [20.9, 6907.0], [21.0, 6923.0], [21.1, 6937.0], [21.2, 6959.0], [21.3, 6989.0], [21.4, 6996.0], [21.5, 7023.0], [21.6, 7061.0], [21.7, 7077.0], [21.8, 7122.0], [21.9, 7142.0], [22.0, 7184.0], [22.1, 7208.0], [22.2, 7225.0], [22.3, 7247.0], [22.4, 7255.0], [22.5, 7278.0], [22.6, 7295.0], [22.7, 7340.0], [22.8, 7351.0], [22.9, 7354.0], [23.0, 7449.0], [23.1, 7489.0], [23.2, 7501.0], [23.3, 7552.0], [23.4, 7558.0], [23.5, 7577.0], [23.6, 7606.0], [23.7, 7654.0], [23.8, 7695.0], [23.9, 7726.0], [24.0, 7752.0], [24.1, 7773.0], [24.2, 7809.0], [24.3, 7826.0], [24.4, 7844.0], [24.5, 7876.0], [24.6, 7928.0], [24.7, 7943.0], [24.8, 7951.0], [24.9, 7972.0], [25.0, 8015.0], [25.1, 8042.0], [25.2, 8062.0], [25.3, 8102.0], [25.4, 8120.0], [25.5, 8151.0], [25.6, 8155.0], [25.7, 8187.0], [25.8, 8207.0], [25.9, 8248.0], [26.0, 8263.0], [26.1, 8295.0], [26.2, 8310.0], [26.3, 8324.0], [26.4, 8342.0], [26.5, 8349.0], [26.6, 8356.0], [26.7, 8363.0], [26.8, 8393.0], [26.9, 8434.0], [27.0, 8465.0], [27.1, 8479.0], [27.2, 8528.0], [27.3, 8549.0], [27.4, 8559.0], [27.5, 8600.0], [27.6, 8628.0], [27.7, 8660.0], [27.8, 8689.0], [27.9, 8695.0], [28.0, 8716.0], [28.1, 8731.0], [28.2, 8763.0], [28.3, 8786.0], [28.4, 8816.0], [28.5, 8845.0], [28.6, 8867.0], [28.7, 8869.0], [28.8, 8881.0], [28.9, 8912.0], [29.0, 8922.0], [29.1, 8930.0], [29.2, 8934.0], [29.3, 8967.0], [29.4, 8974.0], [29.5, 8998.0], [29.6, 9022.0], [29.7, 9041.0], [29.8, 9084.0], [29.9, 9107.0], [30.0, 9133.0], [30.1, 9153.0], [30.2, 9181.0], [30.3, 9206.0], [30.4, 9219.0], [30.5, 9247.0], [30.6, 9259.0], [30.7, 9272.0], [30.8, 9278.0], [30.9, 9293.0], [31.0, 9299.0], [31.1, 9307.0], [31.2, 9313.0], [31.3, 9342.0], [31.4, 9374.0], [31.5, 9396.0], [31.6, 9427.0], [31.7, 9433.0], [31.8, 9445.0], [31.9, 9480.0], [32.0, 9531.0], [32.1, 9543.0], [32.2, 9562.0], [32.3, 9583.0], [32.4, 9627.0], [32.5, 9634.0], [32.6, 9662.0], [32.7, 9678.0], [32.8, 9684.0], [32.9, 9699.0], [33.0, 9703.0], [33.1, 9708.0], [33.2, 9735.0], [33.3, 9773.0], [33.4, 9786.0], [33.5, 9814.0], [33.6, 9854.0], [33.7, 9867.0], [33.8, 9874.0], [33.9, 9883.0], [34.0, 9898.0], [34.1, 9914.0], [34.2, 9928.0], [34.3, 9935.0], [34.4, 9971.0], [34.5, 9988.0], [34.6, 9997.0], [34.7, 10031.0], [34.8, 10054.0], [34.9, 10067.0], [35.0, 10101.0], [35.1, 10113.0], [35.2, 10128.0], [35.3, 10136.0], [35.4, 10145.0], [35.5, 10188.0], [35.6, 10215.0], [35.7, 10264.0], [35.8, 10303.0], [35.9, 10350.0], [36.0, 10380.0], [36.1, 10396.0], [36.2, 10450.0], [36.3, 10496.0], [36.4, 10545.0], [36.5, 10570.0], [36.6, 10611.0], [36.7, 10652.0], [36.8, 10695.0], [36.9, 10716.0], [37.0, 10741.0], [37.1, 10779.0], [37.2, 10783.0], [37.3, 10814.0], [37.4, 10822.0], [37.5, 10863.0], [37.6, 10871.0], [37.7, 10893.0], [37.8, 10956.0], [37.9, 10984.0], [38.0, 11003.0], [38.1, 11010.0], [38.2, 11026.0], [38.3, 11050.0], [38.4, 11076.0], [38.5, 11102.0], [38.6, 11118.0], [38.7, 11126.0], [38.8, 11134.0], [38.9, 11171.0], [39.0, 11206.0], [39.1, 11215.0], [39.2, 11245.0], [39.3, 11275.0], [39.4, 11287.0], [39.5, 11301.0], [39.6, 11318.0], [39.7, 11331.0], [39.8, 11336.0], [39.9, 11384.0], [40.0, 11402.0], [40.1, 11435.0], [40.2, 11460.0], [40.3, 11483.0], [40.4, 11496.0], [40.5, 11507.0], [40.6, 11513.0], [40.7, 11544.0], [40.8, 11562.0], [40.9, 11615.0], [41.0, 11623.0], [41.1, 11633.0], [41.2, 11638.0], [41.3, 11648.0], [41.4, 11659.0], [41.5, 11693.0], [41.6, 11713.0], [41.7, 11761.0], [41.8, 11781.0], [41.9, 11824.0], [42.0, 11829.0], [42.1, 11847.0], [42.2, 11862.0], [42.3, 11874.0], [42.4, 11903.0], [42.5, 11932.0], [42.6, 11967.0], [42.7, 12031.0], [42.8, 12041.0], [42.9, 12070.0], [43.0, 12075.0], [43.1, 12110.0], [43.2, 12160.0], [43.3, 12176.0], [43.4, 12214.0], [43.5, 12241.0], [43.6, 12277.0], [43.7, 12304.0], [43.8, 12313.0], [43.9, 12318.0], [44.0, 12355.0], [44.1, 12415.0], [44.2, 12422.0], [44.3, 12438.0], [44.4, 12472.0], [44.5, 12490.0], [44.6, 12521.0], [44.7, 12533.0], [44.8, 12558.0], [44.9, 12578.0], [45.0, 12594.0], [45.1, 12616.0], [45.2, 12628.0], [45.3, 12652.0], [45.4, 12666.0], [45.5, 12690.0], [45.6, 12693.0], [45.7, 12702.0], [45.8, 12724.0], [45.9, 12760.0], [46.0, 12765.0], [46.1, 12771.0], [46.2, 12798.0], [46.3, 12813.0], [46.4, 12827.0], [46.5, 12853.0], [46.6, 12875.0], [46.7, 12885.0], [46.8, 12913.0], [46.9, 12930.0], [47.0, 12945.0], [47.1, 12968.0], [47.2, 12981.0], [47.3, 13005.0], [47.4, 13039.0], [47.5, 13051.0], [47.6, 13063.0], [47.7, 13095.0], [47.8, 13106.0], [47.9, 13122.0], [48.0, 13144.0], [48.1, 13170.0], [48.2, 13186.0], [48.3, 13204.0], [48.4, 13220.0], [48.5, 13265.0], [48.6, 13283.0], [48.7, 13294.0], [48.8, 13309.0], [48.9, 13320.0], [49.0, 13391.0], [49.1, 13401.0], [49.2, 13411.0], [49.3, 13434.0], [49.4, 13454.0], [49.5, 13468.0], [49.6, 13491.0], [49.7, 13533.0], [49.8, 13559.0], [49.9, 13570.0], [50.0, 13581.0], [50.1, 13593.0], [50.2, 13616.0], [50.3, 13621.0], [50.4, 13632.0], [50.5, 13646.0], [50.6, 13655.0], [50.7, 13665.0], [50.8, 13678.0], [50.9, 13693.0], [51.0, 13715.0], [51.1, 13736.0], [51.2, 13768.0], [51.3, 13791.0], [51.4, 13798.0], [51.5, 13817.0], [51.6, 13823.0], [51.7, 13869.0], [51.8, 13876.0], [51.9, 13889.0], [52.0, 13898.0], [52.1, 13932.0], [52.2, 13941.0], [52.3, 13947.0], [52.4, 13967.0], [52.5, 13989.0], [52.6, 13992.0], [52.7, 13999.0], [52.8, 14005.0], [52.9, 14020.0], [53.0, 14033.0], [53.1, 14073.0], [53.2, 14108.0], [53.3, 14112.0], [53.4, 14116.0], [53.5, 14135.0], [53.6, 14162.0], [53.7, 14186.0], [53.8, 14208.0], [53.9, 14235.0], [54.0, 14250.0], [54.1, 14285.0], [54.2, 14314.0], [54.3, 14321.0], [54.4, 14357.0], [54.5, 14378.0], [54.6, 14387.0], [54.7, 14415.0], [54.8, 14438.0], [54.9, 14453.0], [55.0, 14505.0], [55.1, 14538.0], [55.2, 14560.0], [55.3, 14578.0], [55.4, 14623.0], [55.5, 14641.0], [55.6, 14650.0], [55.7, 14667.0], [55.8, 14685.0], [55.9, 14699.0], [56.0, 14738.0], [56.1, 14745.0], [56.2, 14754.0], [56.3, 14774.0], [56.4, 14785.0], [56.5, 14804.0], [56.6, 14815.0], [56.7, 14841.0], [56.8, 14851.0], [56.9, 14869.0], [57.0, 14899.0], [57.1, 14918.0], [57.2, 14934.0], [57.3, 14960.0], [57.4, 14990.0], [57.5, 15017.0], [57.6, 15042.0], [57.7, 15054.0], [57.8, 15097.0], [57.9, 15119.0], [58.0, 15141.0], [58.1, 15170.0], [58.2, 15185.0], [58.3, 15217.0], [58.4, 15232.0], [58.5, 15265.0], [58.6, 15295.0], [58.7, 15319.0], [58.8, 15340.0], [58.9, 15359.0], [59.0, 15371.0], [59.1, 15376.0], [59.2, 15397.0], [59.3, 15428.0], [59.4, 15441.0], [59.5, 15461.0], [59.6, 15483.0], [59.7, 15501.0], [59.8, 15514.0], [59.9, 15564.0], [60.0, 15576.0], [60.1, 15629.0], [60.2, 15653.0], [60.3, 15669.0], [60.4, 15686.0], [60.5, 15688.0], [60.6, 15697.0], [60.7, 15736.0], [60.8, 15754.0], [60.9, 15766.0], [61.0, 15791.0], [61.1, 15816.0], [61.2, 15834.0], [61.3, 15859.0], [61.4, 15876.0], [61.5, 15928.0], [61.6, 15958.0], [61.7, 15964.0], [61.8, 15993.0], [61.9, 16018.0], [62.0, 16041.0], [62.1, 16060.0], [62.2, 16072.0], [62.3, 16086.0], [62.4, 16093.0], [62.5, 16101.0], [62.6, 16120.0], [62.7, 16123.0], [62.8, 16139.0], [62.9, 16160.0], [63.0, 16170.0], [63.1, 16197.0], [63.2, 16225.0], [63.3, 16235.0], [63.4, 16244.0], [63.5, 16257.0], [63.6, 16270.0], [63.7, 16295.0], [63.8, 16322.0], [63.9, 16356.0], [64.0, 16385.0], [64.1, 16393.0], [64.2, 16413.0], [64.3, 16431.0], [64.4, 16454.0], [64.5, 16469.0], [64.6, 16480.0], [64.7, 16494.0], [64.8, 16510.0], [64.9, 16518.0], [65.0, 16531.0], [65.1, 16540.0], [65.2, 16559.0], [65.3, 16564.0], [65.4, 16631.0], [65.5, 16645.0], [65.6, 16655.0], [65.7, 16662.0], [65.8, 16699.0], [65.9, 16705.0], [66.0, 16733.0], [66.1, 16741.0], [66.2, 16758.0], [66.3, 16781.0], [66.4, 16792.0], [66.5, 16825.0], [66.6, 16847.0], [66.7, 16889.0], [66.8, 16895.0], [66.9, 16932.0], [67.0, 16942.0], [67.1, 16947.0], [67.2, 16984.0], [67.3, 16998.0], [67.4, 17017.0], [67.5, 17052.0], [67.6, 17070.0], [67.7, 17076.0], [67.8, 17118.0], [67.9, 17133.0], [68.0, 17151.0], [68.1, 17179.0], [68.2, 17216.0], [68.3, 17229.0], [68.4, 17237.0], [68.5, 17257.0], [68.6, 17296.0], [68.7, 17321.0], [68.8, 17339.0], [68.9, 17349.0], [69.0, 17371.0], [69.1, 17379.0], [69.2, 17392.0], [69.3, 17395.0], [69.4, 17404.0], [69.5, 17431.0], [69.6, 17444.0], [69.7, 17466.0], [69.8, 17487.0], [69.9, 17518.0], [70.0, 17530.0], [70.1, 17540.0], [70.2, 17559.0], [70.3, 17588.0], [70.4, 17612.0], [70.5, 17640.0], [70.6, 17642.0], [70.7, 17654.0], [70.8, 17664.0], [70.9, 17698.0], [71.0, 17731.0], [71.1, 17738.0], [71.2, 17750.0], [71.3, 17772.0], [71.4, 17798.0], [71.5, 17863.0], [71.6, 17943.0], [71.7, 17951.0], [71.8, 17956.0], [71.9, 17982.0], [72.0, 18006.0], [72.1, 18028.0], [72.2, 18058.0], [72.3, 18082.0], [72.4, 18099.0], [72.5, 18106.0], [72.6, 18124.0], [72.7, 18135.0], [72.8, 18161.0], [72.9, 18191.0], [73.0, 18218.0], [73.1, 18229.0], [73.2, 18251.0], [73.3, 18276.0], [73.4, 18295.0], [73.5, 18312.0], [73.6, 18337.0], [73.7, 18365.0], [73.8, 18376.0], [73.9, 18397.0], [74.0, 18429.0], [74.1, 18437.0], [74.2, 18459.0], [74.3, 18482.0], [74.4, 18492.0], [74.5, 18503.0], [74.6, 18518.0], [74.7, 18528.0], [74.8, 18537.0], [74.9, 18553.0], [75.0, 18578.0], [75.1, 18634.0], [75.2, 18641.0], [75.3, 18649.0], [75.4, 18664.0], [75.5, 18695.0], [75.6, 18728.0], [75.7, 18738.0], [75.8, 18774.0], [75.9, 18807.0], [76.0, 18829.0], [76.1, 18846.0], [76.2, 18875.0], [76.3, 18893.0], [76.4, 18936.0], [76.5, 18975.0], [76.6, 19024.0], [76.7, 19036.0], [76.8, 19046.0], [76.9, 19062.0], [77.0, 19070.0], [77.1, 19081.0], [77.2, 19113.0], [77.3, 19134.0], [77.4, 19145.0], [77.5, 19160.0], [77.6, 19171.0], [77.7, 19218.0], [77.8, 19226.0], [77.9, 19242.0], [78.0, 19259.0], [78.1, 19291.0], [78.2, 19325.0], [78.3, 19349.0], [78.4, 19368.0], [78.5, 19389.0], [78.6, 19425.0], [78.7, 19445.0], [78.8, 19456.0], [78.9, 19469.0], [79.0, 19522.0], [79.1, 19530.0], [79.2, 19549.0], [79.3, 19592.0], [79.4, 19625.0], [79.5, 19632.0], [79.6, 19681.0], [79.7, 19723.0], [79.8, 19751.0], [79.9, 19768.0], [80.0, 19787.0], [80.1, 19808.0], [80.2, 19859.0], [80.3, 19877.0], [80.4, 19904.0], [80.5, 19943.0], [80.6, 19962.0], [80.7, 20012.0], [80.8, 20032.0], [80.9, 20038.0], [81.0, 20050.0], [81.1, 20095.0], [81.2, 20130.0], [81.3, 20162.0], [81.4, 20182.0], [81.5, 20230.0], [81.6, 20257.0], [81.7, 20274.0], [81.8, 20309.0], [81.9, 20331.0], [82.0, 20355.0], [82.1, 20387.0], [82.2, 20428.0], [82.3, 20451.0], [82.4, 20513.0], [82.5, 20548.0], [82.6, 20582.0], [82.7, 20598.0], [82.8, 20604.0], [82.9, 20614.0], [83.0, 20646.0], [83.1, 20662.0], [83.2, 20671.0], [83.3, 20697.0], [83.4, 20716.0], [83.5, 20774.0], [83.6, 20832.0], [83.7, 20840.0], [83.8, 20886.0], [83.9, 20924.0], [84.0, 20940.0], [84.1, 20981.0], [84.2, 21018.0], [84.3, 21046.0], [84.4, 21100.0], [84.5, 21129.0], [84.6, 21208.0], [84.7, 21252.0], [84.8, 21310.0], [84.9, 21358.0], [85.0, 21423.0], [85.1, 21458.0], [85.2, 21510.0], [85.3, 21538.0], [85.4, 21572.0], [85.5, 21622.0], [85.6, 21638.0], [85.7, 21678.0], [85.8, 21699.0], [85.9, 21727.0], [86.0, 21772.0], [86.1, 21792.0], [86.2, 21835.0], [86.3, 21873.0], [86.4, 21921.0], [86.5, 21932.0], [86.6, 21955.0], [86.7, 21973.0], [86.8, 21979.0], [86.9, 22017.0], [87.0, 22044.0], [87.1, 22063.0], [87.2, 22077.0], [87.3, 22104.0], [87.4, 22108.0], [87.5, 22132.0], [87.6, 22175.0], [87.7, 22200.0], [87.8, 22209.0], [87.9, 22228.0], [88.0, 22246.0], [88.1, 22266.0], [88.2, 22300.0], [88.3, 22310.0], [88.4, 22331.0], [88.5, 22346.0], [88.6, 22357.0], [88.7, 22396.0], [88.8, 22410.0], [88.9, 22417.0], [89.0, 22433.0], [89.1, 22452.0], [89.2, 22466.0], [89.3, 22483.0], [89.4, 22530.0], [89.5, 22539.0], [89.6, 22576.0], [89.7, 22583.0], [89.8, 22608.0], [89.9, 22651.0], [90.0, 22704.0], [90.1, 22729.0], [90.2, 22760.0], [90.3, 22769.0], [90.4, 22781.0], [90.5, 22798.0], [90.6, 22837.0], [90.7, 22841.0], [90.8, 22856.0], [90.9, 22877.0], [91.0, 22889.0], [91.1, 22912.0], [91.2, 22917.0], [91.3, 22952.0], [91.4, 22963.0], [91.5, 22975.0], [91.6, 22984.0], [91.7, 23004.0], [91.8, 23018.0], [91.9, 23037.0], [92.0, 23064.0], [92.1, 23071.0], [92.2, 23091.0], [92.3, 23107.0], [92.4, 23147.0], [92.5, 23176.0], [92.6, 23190.0], [92.7, 23221.0], [92.8, 23235.0], [92.9, 23274.0], [93.0, 23305.0], [93.1, 23348.0], [93.2, 23392.0], [93.3, 23429.0], [93.4, 23451.0], [93.5, 23493.0], [93.6, 23532.0], [93.7, 23549.0], [93.8, 23600.0], [93.9, 23608.0], [94.0, 23652.0], [94.1, 23732.0], [94.2, 23747.0], [94.3, 23769.0], [94.4, 23804.0], [94.5, 23831.0], [94.6, 23856.0], [94.7, 23904.0], [94.8, 23968.0], [94.9, 24018.0], [95.0, 24049.0], [95.1, 24108.0], [95.2, 24142.0], [95.3, 24154.0], [95.4, 24179.0], [95.5, 24200.0], [95.6, 24224.0], [95.7, 24266.0], [95.8, 24298.0], [95.9, 24343.0], [96.0, 24375.0], [96.1, 24398.0], [96.2, 24453.0], [96.3, 24458.0], [96.4, 24467.0], [96.5, 24495.0], [96.6, 24515.0], [96.7, 24549.0], [96.8, 24563.0], [96.9, 24611.0], [97.0, 24682.0], [97.1, 24744.0], [97.2, 24769.0], [97.3, 24779.0], [97.4, 24799.0], [97.5, 24892.0], [97.6, 24909.0], [97.7, 24943.0], [97.8, 25019.0], [97.9, 25046.0], [98.0, 25056.0], [98.1, 25093.0], [98.2, 25158.0], [98.3, 25219.0], [98.4, 25322.0], [98.5, 25328.0], [98.6, 25375.0], [98.7, 25401.0], [98.8, 25442.0], [98.9, 25483.0], [99.0, 25539.0], [99.1, 25571.0], [99.2, 25601.0], [99.3, 25628.0], [99.4, 25719.0], [99.5, 25758.0], [99.6, 25826.0], [99.7, 25833.0], [99.8, 25868.0], [99.9, 26151.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 32.0, "series": [{"data": [[500.0, 3.0], [600.0, 2.0], [700.0, 3.0], [800.0, 7.0], [900.0, 8.0], [1000.0, 6.0], [1100.0, 10.0], [1200.0, 5.0], [1300.0, 4.0], [1400.0, 2.0], [1500.0, 1.0], [1600.0, 1.0], [2100.0, 4.0], [2200.0, 3.0], [2300.0, 3.0], [2400.0, 1.0], [2500.0, 1.0], [2600.0, 1.0], [2800.0, 3.0], [2700.0, 2.0], [2900.0, 4.0], [3000.0, 3.0], [3100.0, 5.0], [3200.0, 5.0], [3300.0, 9.0], [3400.0, 14.0], [3500.0, 11.0], [3600.0, 20.0], [3700.0, 7.0], [3800.0, 15.0], [3900.0, 13.0], [4000.0, 9.0], [4100.0, 19.0], [4200.0, 17.0], [4300.0, 12.0], [4500.0, 21.0], [4600.0, 18.0], [4400.0, 18.0], [4700.0, 21.0], [4800.0, 21.0], [4900.0, 32.0], [5000.0, 26.0], [5100.0, 16.0], [5200.0, 19.0], [5300.0, 18.0], [5400.0, 14.0], [5500.0, 14.0], [5600.0, 11.0], [5800.0, 11.0], [5700.0, 10.0], [5900.0, 9.0], [6100.0, 10.0], [6000.0, 16.0], [6200.0, 13.0], [6300.0, 16.0], [6400.0, 16.0], [6600.0, 15.0], [6500.0, 9.0], [6800.0, 9.0], [6700.0, 10.0], [6900.0, 16.0], [7100.0, 11.0], [7000.0, 9.0], [7200.0, 16.0], [7300.0, 9.0], [7400.0, 8.0], [7600.0, 7.0], [7500.0, 12.0], [7700.0, 11.0], [7800.0, 10.0], [7900.0, 13.0], [8000.0, 10.0], [8100.0, 15.0], [8200.0, 10.0], [8300.0, 21.0], [8500.0, 9.0], [8400.0, 11.0], [8600.0, 14.0], [8700.0, 13.0], [8800.0, 15.0], [8900.0, 19.0], [9100.0, 12.0], [9000.0, 11.0], [9200.0, 22.0], [9300.0, 15.0], [9400.0, 12.0], [9500.0, 14.0], [9600.0, 16.0], [9700.0, 16.0], [9800.0, 17.0], [9900.0, 19.0], [10100.0, 18.0], [10000.0, 10.0], [10200.0, 6.0], [10300.0, 10.0], [10400.0, 6.0], [10500.0, 7.0], [10600.0, 9.0], [10700.0, 12.0], [10900.0, 8.0], [11200.0, 15.0], [11000.0, 15.0], [11100.0, 15.0], [10800.0, 14.0], [11300.0, 15.0], [11700.0, 9.0], [11600.0, 20.0], [11500.0, 13.0], [11400.0, 14.0], [11800.0, 15.0], [11900.0, 9.0], [12100.0, 9.0], [12200.0, 9.0], [12000.0, 13.0], [12400.0, 15.0], [12600.0, 18.0], [12700.0, 18.0], [12300.0, 11.0], [12500.0, 14.0], [13100.0, 16.0], [12800.0, 16.0], [12900.0, 17.0], [13000.0, 13.0], [13200.0, 15.0], [13300.0, 10.0], [13600.0, 24.0], [13700.0, 14.0], [13800.0, 18.0], [13400.0, 16.0], [13500.0, 16.0], [13900.0, 21.0], [14000.0, 13.0], [14200.0, 12.0], [14100.0, 18.0], [14300.0, 15.0], [14400.0, 9.0], [14500.0, 11.0], [14600.0, 18.0], [14700.0, 17.0], [14800.0, 16.0], [15100.0, 12.0], [14900.0, 12.0], [15200.0, 12.0], [15300.0, 17.0], [15000.0, 13.0], [15700.0, 13.0], [15400.0, 14.0], [15500.0, 11.0], [15600.0, 17.0], [15800.0, 11.0], [16200.0, 18.0], [15900.0, 13.0], [16100.0, 20.0], [16000.0, 18.0], [16300.0, 13.0], [16600.0, 14.0], [16400.0, 18.0], [17000.0, 14.0], [16800.0, 11.0], [17200.0, 15.0], [17400.0, 16.0], [18200.0, 16.0], [17800.0, 4.0], [18000.0, 13.0], [18400.0, 17.0], [17600.0, 19.0], [18600.0, 14.0], [19000.0, 19.0], [19400.0, 13.0], [19200.0, 13.0], [18800.0, 13.0], [19800.0, 9.0], [19600.0, 9.0], [20000.0, 13.0], [20200.0, 11.0], [20400.0, 5.0], [20800.0, 9.0], [20600.0, 18.0], [21200.0, 6.0], [21000.0, 6.0], [21400.0, 5.0], [21600.0, 11.0], [22000.0, 14.0], [21800.0, 8.0], [22400.0, 18.0], [22200.0, 15.0], [22800.0, 16.0], [23400.0, 9.0], [22600.0, 6.0], [23200.0, 10.0], [23000.0, 16.0], [23800.0, 9.0], [24400.0, 12.0], [23600.0, 8.0], [24200.0, 10.0], [24000.0, 5.0], [24800.0, 3.0], [24600.0, 5.0], [25200.0, 4.0], [25000.0, 12.0], [25400.0, 8.0], [25600.0, 6.0], [25800.0, 9.0], [26200.0, 1.0], [16500.0, 18.0], [16700.0, 19.0], [17100.0, 10.0], [16900.0, 15.0], [17300.0, 21.0], [17500.0, 14.0], [17900.0, 13.0], [17700.0, 14.0], [18100.0, 15.0], [18300.0, 14.0], [18500.0, 17.0], [18700.0, 11.0], [19100.0, 16.0], [18900.0, 6.0], [19300.0, 12.0], [19700.0, 13.0], [19900.0, 9.0], [20100.0, 9.0], [19500.0, 12.0], [20300.0, 12.0], [20500.0, 11.0], [20700.0, 7.0], [20900.0, 10.0], [21300.0, 6.0], [21500.0, 9.0], [21100.0, 6.0], [21700.0, 9.0], [21900.0, 13.0], [22100.0, 12.0], [22500.0, 14.0], [22300.0, 16.0], [23500.0, 8.0], [23300.0, 7.0], [22900.0, 19.0], [22700.0, 16.0], [23100.0, 13.0], [24300.0, 9.0], [24100.0, 13.0], [23700.0, 10.0], [24500.0, 11.0], [23900.0, 6.0], [24900.0, 6.0], [25100.0, 4.0], [25300.0, 9.0], [25500.0, 7.0], [24700.0, 11.0], [25700.0, 4.0], [25900.0, 1.0], [26100.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 26200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2950.0, "series": [{"data": [[1.0, 50.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2950.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1265.6560000000015, "minX": 1.54960812E12, "maxY": 1265.6560000000015, "series": [{"data": [[1.54960812E12, 1265.6560000000015]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1172.0, "minX": 2.0, "maxY": 26205.0, "series": [{"data": [[2.0, 24674.5], [3.0, 22837.0], [5.0, 23268.5], [6.0, 22456.0], [7.0, 25841.0], [9.0, 24554.0], [10.0, 23709.0], [11.0, 23429.0], [12.0, 22915.0], [13.0, 22856.0], [14.0, 25641.0], [15.0, 23121.0], [16.0, 25328.0], [17.0, 24035.0], [18.0, 22761.0], [19.0, 22912.0], [20.0, 24150.0], [21.0, 25228.0], [22.0, 22990.0], [23.0, 25405.0], [24.0, 25037.0], [25.0, 23532.0], [26.0, 25601.0], [27.0, 23012.0], [28.0, 23023.0], [29.0, 23583.0], [30.0, 22400.0], [33.0, 24108.0], [32.0, 23920.5], [35.0, 22760.0], [34.0, 22959.0], [37.0, 24332.5], [39.0, 22928.0], [38.0, 26205.0], [41.0, 24631.0], [40.0, 24779.0], [43.0, 22769.0], [42.0, 25667.0], [45.0, 25868.0], [44.0, 24223.0], [47.0, 25576.0], [46.0, 22841.0], [49.0, 23804.0], [48.0, 23228.0], [51.0, 26121.0], [50.0, 23603.0], [53.0, 24166.0], [52.0, 22917.0], [55.0, 24495.0], [54.0, 22782.0], [57.0, 25728.0], [56.0, 22735.0], [59.0, 23435.0], [58.0, 24769.0], [61.0, 22466.0], [60.0, 24907.0], [63.0, 24682.0], [62.0, 23772.0], [66.0, 24552.0], [65.0, 26165.0], [64.0, 24458.0], [71.0, 25227.0], [70.0, 25103.5], [68.0, 24200.5], [75.0, 25485.0], [74.0, 22396.0], [73.0, 25019.0], [72.0, 24755.0], [79.0, 23338.5], [77.0, 23592.0], [76.0, 24151.0], [83.0, 23769.0], [82.0, 25609.0], [81.0, 24119.0], [80.0, 24055.0], [87.0, 24298.0], [86.0, 25557.0], [85.0, 25375.0], [84.0, 24233.0], [91.0, 25141.0], [90.0, 23451.0], [89.0, 25730.0], [88.0, 24197.0], [95.0, 22877.0], [94.0, 25382.0], [93.0, 24356.0], [92.0, 24224.0], [99.0, 24758.0], [98.0, 25442.0], [97.0, 23092.5], [103.0, 22667.0], [102.0, 23789.0], [101.0, 22452.0], [100.0, 22772.0], [107.0, 22975.0], [106.0, 23837.0], [105.0, 23938.5], [111.0, 24902.0], [110.0, 22704.0], [109.0, 24453.0], [108.0, 25093.0], [114.0, 24915.0], [113.0, 25003.0], [112.0, 23492.0], [119.0, 23914.0], [118.0, 24773.0], [117.0, 23732.0], [116.0, 23820.5], [123.0, 23419.0], [122.0, 24475.0], [121.0, 23091.0], [120.0, 23037.0], [127.0, 12805.5], [126.0, 24773.0], [125.0, 22357.0], [124.0, 25467.0], [135.0, 25440.0], [134.0, 22413.0], [133.0, 22840.0], [132.0, 23831.0], [131.0, 25833.0], [130.0, 22315.0], [129.0, 24464.0], [128.0, 22651.0], [138.0, 12523.0], [143.0, 25919.0], [142.0, 23004.0], [141.0, 23652.0], [140.0, 25833.0], [139.0, 24323.0], [137.0, 23420.0], [136.0, 22222.0], [151.0, 23147.0], [150.0, 25758.0], [149.0, 24384.0], [148.0, 23987.0], [147.0, 22704.0], [146.0, 23274.0], [145.0, 24382.0], [144.0, 25581.0], [159.0, 22331.0], [158.0, 25628.0], [157.0, 24799.0], [156.0, 24914.0], [155.0, 23856.0], [154.0, 24943.0], [153.0, 25084.0], [152.0, 22310.0], [160.0, 11846.0], [164.0, 11818.5], [167.0, 22978.0], [166.0, 24744.0], [165.0, 25176.0], [163.0, 25401.0], [162.0, 22415.0], [161.0, 25322.0], [171.0, 12561.5], [175.0, 22310.0], [174.0, 22781.0], [173.0, 22764.0], [172.0, 23190.0], [170.0, 23904.0], [169.0, 25805.0], [168.0, 24681.0], [183.0, 25719.0], [182.0, 23388.0], [181.0, 23069.0], [180.0, 24457.0], [179.0, 23071.0], [178.0, 24115.0], [177.0, 25483.0], [176.0, 24892.0], [186.0, 12649.5], [191.0, 23164.0], [190.0, 25325.0], [189.0, 23077.0], [188.0, 22112.0], [187.0, 22072.0], [185.0, 25826.0], [184.0, 24142.0], [194.0, 16252.666666666668], [199.0, 23221.0], [198.0, 23607.0], [197.0, 22977.0], [196.0, 22949.0], [195.0, 24270.0], [192.0, 22812.0], [207.0, 24709.0], [206.0, 22061.0], [205.0, 21979.0], [204.0, 25332.0], [203.0, 24398.0], [202.0, 23197.0], [201.0, 24266.0], [200.0, 22339.0], [210.0, 11704.0], [215.0, 25219.0], [214.0, 21973.0], [213.0, 22595.0], [212.0, 22798.0], [211.0, 25606.0], [209.0, 22224.0], [208.0, 24018.0], [217.0, 11920.0], [216.0, 11936.0], [223.0, 12666.0], [222.0, 24449.0], [221.0, 23755.0], [220.0, 25000.0], [219.0, 24164.0], [218.0, 23152.0], [227.0, 11327.5], [231.0, 25454.0], [230.0, 22693.0], [229.0, 22942.0], [226.0, 22792.0], [225.0, 24025.0], [224.0, 24309.0], [239.0, 23767.0], [238.0, 23068.0], [237.0, 25539.0], [236.0, 24236.0], [235.0, 23179.0], [234.0, 21821.0], [233.0, 22433.0], [232.0, 22576.0], [240.0, 12272.5], [241.0, 13196.0], [247.0, 8591.0], [246.0, 25350.0], [245.0, 23531.0], [244.0, 22590.0], [243.0, 22341.0], [242.0, 22872.0], [250.0, 12814.0], [255.0, 22984.0], [254.0, 24194.0], [253.0, 21772.0], [252.0, 25046.0], [251.0, 25500.0], [249.0, 23235.0], [248.0, 21970.0], [270.0, 12194.5], [260.0, 8774.333333333332], [261.0, 23549.0], [263.0, 23608.0], [257.0, 25557.0], [256.0, 24508.0], [259.0, 22077.0], [258.0, 22963.0], [262.0, 22433.0], [264.0, 13165.5], [271.0, 6352.0], [269.0, 22346.0], [268.0, 24611.0], [267.0, 24218.0], [266.0, 23342.0], [265.0, 21948.0], [286.0, 11818.0], [272.0, 11598.5], [274.0, 23274.0], [273.0, 23995.0], [279.0, 22175.0], [278.0, 23532.0], [277.0, 24154.0], [276.0, 23336.0], [275.0, 13057.0], [280.0, 11997.0], [285.0, 12308.0], [287.0, 8162.0], [284.0, 23018.0], [283.0, 22410.0], [282.0, 22264.0], [281.0, 22180.0], [303.0, 23968.0], [295.0, 12055.5], [294.0, 25129.0], [293.0, 22293.0], [292.0, 22294.0], [298.0, 13099.5], [302.0, 23289.0], [301.0, 24584.0], [300.0, 22577.0], [291.0, 23104.0], [290.0, 24562.0], [289.0, 21596.0], [288.0, 24578.0], [299.0, 24200.0], [297.0, 22307.0], [296.0, 24295.0], [318.0, 23041.0], [307.0, 11974.0], [306.0, 22238.0], [305.0, 22012.0], [304.0, 25047.0], [311.0, 22266.0], [310.0, 22132.0], [309.0, 22303.0], [308.0, 22206.0], [319.0, 22187.0], [317.0, 22533.0], [316.0, 23433.0], [315.0, 22351.0], [314.0, 22084.0], [313.0, 23819.0], [312.0, 23185.0], [335.0, 21923.0], [327.0, 11267.5], [326.0, 23688.0], [325.0, 23600.0], [324.0, 24343.0], [331.0, 12028.5], [334.0, 21623.0], [333.0, 24467.0], [332.0, 21727.0], [323.0, 25208.0], [322.0, 22500.0], [321.0, 22356.0], [320.0, 22108.0], [330.0, 24909.0], [329.0, 22036.0], [328.0, 21638.0], [350.0, 24826.0], [336.0, 12868.0], [339.0, 21955.0], [338.0, 22882.0], [337.0, 22067.0], [343.0, 21770.0], [340.0, 11850.0], [341.0, 23481.0], [342.0, 11789.0], [345.0, 12292.0], [347.0, 12253.5], [346.0, 24698.0], [351.0, 12151.0], [344.0, 22614.0], [349.0, 22560.0], [348.0, 21924.0], [367.0, 24546.0], [353.0, 8926.666666666668], [359.0, 22549.0], [352.0, 23734.0], [358.0, 24420.0], [357.0, 22300.0], [356.0, 22395.0], [360.0, 12339.0], [365.0, 12228.5], [366.0, 21921.0], [364.0, 22044.0], [355.0, 21978.0], [354.0, 21788.0], [363.0, 21525.0], [362.0, 24490.0], [361.0, 22053.0], [382.0, 22207.0], [383.0, 21532.0], [381.0, 21720.0], [380.0, 24805.0], [379.0, 22704.0], [378.0, 22516.0], [377.0, 22778.0], [376.0, 22844.0], [375.0, 22482.0], [369.0, 21433.0], [368.0, 22104.0], [371.0, 22002.0], [370.0, 21252.0], [373.0, 21497.0], [372.0, 23747.0], [398.0, 24367.0], [387.0, 1172.0], [389.0, 12222.0], [388.0, 21673.0], [391.0, 24103.0], [384.0, 22876.0], [386.0, 20997.0], [385.0, 22966.0], [390.0, 22844.0], [399.0, 23122.0], [397.0, 22907.0], [396.0, 21678.0], [395.0, 20843.0], [394.0, 22228.0], [393.0, 21878.0], [392.0, 23064.0], [414.0, 20914.0], [405.0, 11395.5], [404.0, 21210.0], [407.0, 21502.0], [401.0, 21026.0], [400.0, 21129.0], [403.0, 20840.0], [402.0, 21878.0], [406.0, 22453.0], [415.0, 21208.0], [413.0, 20646.0], [412.0, 20650.0], [411.0, 21637.0], [410.0, 21558.0], [409.0, 21273.0], [408.0, 22583.0], [430.0, 22246.0], [418.0, 11908.5], [417.0, 22754.0], [416.0, 23235.0], [419.0, 23493.0], [422.0, 22898.0], [421.0, 22915.0], [420.0, 21310.0], [428.0, 11755.0], [431.0, 20950.0], [429.0, 21686.0], [427.0, 20689.0], [426.0, 21699.0], [425.0, 22200.0], [424.0, 20778.0], [446.0, 21106.0], [436.0, 11785.0], [437.0, 21117.0], [439.0, 20673.0], [433.0, 21046.0], [432.0, 20977.0], [435.0, 21979.0], [434.0, 22106.0], [438.0, 21076.0], [447.0, 22136.0], [445.0, 20840.0], [444.0, 22386.0], [443.0, 23305.0], [442.0, 20355.0], [441.0, 20714.0], [440.0, 21143.0], [462.0, 20735.0], [463.0, 21441.0], [461.0, 20451.0], [460.0, 21853.0], [459.0, 20584.0], [458.0, 20563.0], [457.0, 22424.0], [456.0, 22025.0], [455.0, 22530.0], [449.0, 22474.0], [448.0, 20835.0], [451.0, 22017.0], [450.0, 22249.0], [454.0, 22209.0], [453.0, 20662.0], [452.0, 23810.0], [478.0, 20701.0], [479.0, 20924.0], [477.0, 21334.0], [476.0, 21150.0], [475.0, 21542.0], [474.0, 20376.0], [473.0, 21538.0], [472.0, 20542.0], [471.0, 22131.0], [465.0, 21777.0], [464.0, 21622.0], [467.0, 20601.0], [466.0, 20661.0], [470.0, 20166.0], [469.0, 20633.0], [468.0, 21944.0], [494.0, 20671.0], [495.0, 20604.0], [493.0, 21816.0], [492.0, 20309.0], [491.0, 20047.0], [490.0, 20387.0], [489.0, 20697.0], [488.0, 21572.0], [487.0, 21100.0], [481.0, 20931.0], [480.0, 21283.0], [483.0, 21458.0], [482.0, 20613.0], [486.0, 22104.0], [485.0, 20220.0], [484.0, 20130.0], [510.0, 20716.0], [511.0, 20390.0], [509.0, 21932.0], [508.0, 21358.0], [507.0, 20331.0], [506.0, 19962.0], [505.0, 20869.0], [504.0, 20117.0], [503.0, 19768.0], [497.0, 23375.0], [496.0, 20257.0], [499.0, 21669.0], [498.0, 21792.0], [502.0, 20012.0], [501.0, 22079.0], [500.0, 21510.0], [540.0, 19455.0], [542.0, 19632.0], [538.0, 20309.0], [536.0, 19592.0], [534.0, 19657.0], [532.0, 20036.0], [530.0, 20598.0], [528.0, 20373.0], [526.0, 19921.0], [514.0, 20428.0], [512.0, 20748.0], [518.0, 21961.0], [516.0, 21721.0], [524.0, 19798.0], [522.0, 20898.0], [520.0, 20230.0], [572.0, 20782.0], [574.0, 19440.0], [570.0, 19466.0], [568.0, 19543.0], [566.0, 21343.0], [564.0, 20620.0], [562.0, 19625.0], [560.0, 20138.0], [558.0, 19247.0], [546.0, 20500.0], [544.0, 19880.0], [550.0, 19673.0], [548.0, 19527.0], [556.0, 20609.0], [554.0, 20162.0], [552.0, 19627.0], [604.0, 19445.0], [606.0, 19131.0], [602.0, 19061.0], [600.0, 20024.0], [598.0, 19368.0], [596.0, 19226.0], [594.0, 19089.0], [592.0, 19961.0], [590.0, 21018.0], [576.0, 20800.0], [582.0, 19456.0], [578.0, 20433.0], [588.0, 19530.0], [586.0, 19199.0], [584.0, 19030.0], [636.0, 20664.0], [638.0, 19143.0], [634.0, 18695.0], [632.0, 18738.0], [630.0, 18552.0], [628.0, 20532.0], [626.0, 19100.0], [624.0, 19532.0], [622.0, 19551.0], [610.0, 18936.0], [608.0, 19028.0], [614.0, 18846.0], [612.0, 20055.0], [620.0, 19771.0], [618.0, 18634.0], [616.0, 19325.0], [668.0, 20068.0], [664.0, 11102.0], [670.0, 18431.0], [666.0, 18774.0], [662.0, 20019.0], [660.0, 19004.0], [658.0, 19221.0], [656.0, 19525.0], [654.0, 19943.0], [642.0, 19259.0], [640.0, 20032.0], [646.0, 20274.0], [644.0, 19356.0], [652.0, 19904.0], [650.0, 20513.0], [700.0, 18648.0], [680.0, 8076.666666666667], [684.0, 18464.0], [682.0, 19226.0], [686.0, 10477.0], [702.0, 17965.0], [698.0, 18578.0], [696.0, 18321.0], [678.0, 19514.0], [676.0, 19745.0], [674.0, 18537.0], [672.0, 19995.0], [694.0, 18891.0], [692.0, 18665.0], [690.0, 19453.0], [688.0, 19158.0], [732.0, 18456.0], [714.0, 10252.5], [712.0, 18465.0], [716.0, 10337.0], [734.0, 19019.0], [730.0, 18028.0], [728.0, 17395.0], [718.0, 17458.0], [706.0, 18099.0], [704.0, 18588.0], [710.0, 17593.5], [708.0, 18482.0], [726.0, 20038.0], [724.0, 20832.0], [722.0, 18218.0], [720.0, 18130.0], [766.0, 18195.0], [752.0, 10142.5], [764.0, 18648.0], [762.0, 17530.0], [760.0, 18664.0], [742.0, 18687.0], [740.0, 18008.0], [738.0, 18881.0], [736.0, 18768.0], [758.0, 17400.0], [756.0, 17631.0], [754.0, 18430.0], [750.0, 17745.0], [748.0, 17331.0], [746.0, 20289.0], [744.0, 18298.0], [798.0, 16998.0], [790.0, 10221.0], [792.0, 13245.333333333334], [774.0, 17802.0], [772.0, 18535.0], [770.0, 17074.0], [768.0, 18818.0], [796.0, 18082.0], [794.0, 17798.0], [788.0, 19522.0], [786.0, 17607.0], [784.0, 17318.0], [782.0, 17045.0], [780.0, 18179.0], [778.0, 18046.0], [776.0, 17776.0], [828.0, 19616.0], [830.0, 17518.0], [826.0, 16458.0], [824.0, 18101.0], [822.0, 17982.0], [820.0, 20182.0], [818.0, 19081.0], [816.0, 17556.0], [814.0, 18492.0], [800.0, 19285.0], [804.0, 19020.0], [802.0, 18191.0], [812.0, 20162.0], [810.0, 17017.0], [808.0, 16645.0], [860.0, 17952.0], [838.0, 9986.5], [836.0, 16512.0], [834.0, 19078.0], [832.0, 17251.0], [846.0, 17951.0], [844.0, 17768.0], [842.0, 17334.0], [840.0, 19366.0], [862.0, 19836.0], [858.0, 17443.0], [856.0, 18971.0], [854.0, 17216.0], [852.0, 17944.0], [850.0, 17400.0], [848.0, 18058.0], [892.0, 17013.0], [868.0, 10514.5], [866.0, 16264.0], [864.0, 19339.0], [870.0, 19787.0], [878.0, 17699.0], [876.0, 17126.0], [874.0, 18108.0], [872.0, 18187.0], [894.0, 18124.0], [890.0, 17632.0], [888.0, 19113.0], [886.0, 19070.0], [884.0, 19242.0], [882.0, 18352.0], [880.0, 19463.0], [910.0, 16781.0], [922.0, 10070.0], [906.0, 17640.0], [904.0, 19054.5], [908.0, 16781.0], [920.0, 17927.0], [902.0, 17600.0], [900.0, 16653.0], [898.0, 17141.0], [896.0, 16647.0], [912.0, 19114.0], [914.0, 17213.0], [916.0, 16642.0], [918.0, 17656.0], [926.0, 16631.0], [924.0, 16921.0], [930.0, 10836.5], [928.0, 17803.0], [932.0, 18366.0], [934.0, 18508.0], [942.0, 18241.0], [940.0, 17540.5], [938.0, 18541.0], [936.0, 17585.0], [946.0, 10273.5], [944.0, 17109.0], [948.0, 17731.0], [950.0, 10745.5], [958.0, 9770.0], [956.0, 10654.5], [954.0, 9909.5], [952.0, 7819.333333333333], [960.0, 3566.0], [962.0, 17287.0], [974.0, 16316.0], [964.0, 10361.5], [972.0, 10583.0], [970.0, 10273.5], [968.0, 10006.5], [966.0, 17745.0], [984.0, 17467.0], [988.0, 16709.0], [990.0, 16655.0], [976.0, 16662.0], [978.0, 17530.0], [980.0, 18520.0], [982.0, 16894.0], [1020.0, 16373.0], [1008.0, 17179.0], [1010.0, 16454.0], [1012.0, 16728.0], [1022.0, 17390.0], [1018.0, 15866.0], [1016.0, 16825.0], [992.0, 16932.0], [994.0, 17018.0], [996.0, 16536.0], [998.0, 16564.0], [1006.0, 16997.0], [1002.0, 17791.0], [1000.0, 18121.0], [1014.0, 17140.0], [1080.0, 17229.0], [1056.0, 16943.0], [1060.0, 15669.0], [1064.0, 16945.0], [1084.0, 15576.0], [1076.0, 15295.0], [1072.0, 16092.0], [1024.0, 17339.0], [1028.0, 17524.0], [1032.0, 17201.0], [1036.0, 16322.0], [1052.0, 16482.0], [1048.0, 15695.0], [1044.0, 17540.0], [1040.0, 17588.0], [1068.0, 16749.0], [1092.0, 16107.0], [1144.0, 14669.0], [1088.0, 9501.5], [1116.0, 15928.0], [1112.0, 15456.0], [1108.0, 16389.0], [1104.0, 16933.0], [1140.0, 9368.5], [1124.0, 15195.0], [1128.0, 16077.0], [1132.0, 15356.0], [1148.0, 15667.0], [1136.0, 15397.0], [1100.0, 16859.0], [1096.0, 16733.0], [1212.0, 14250.0], [1204.0, 9887.0], [1196.0, 9384.5], [1184.0, 15964.0], [1188.0, 14492.0], [1192.0, 15723.0], [1208.0, 15229.0], [1200.0, 14725.0], [1152.0, 17070.0], [1156.0, 16386.0], [1160.0, 14786.0], [1164.0, 15480.0], [1180.0, 15031.0], [1176.0, 15428.0], [1172.0, 16213.0], [1168.0, 16469.0], [1228.0, 16518.0], [1216.0, 15653.0], [1220.0, 15461.0], [1264.0, 15098.0], [1224.0, 16176.0], [1268.0, 16235.0], [1272.0, 15716.0], [1276.0, 16351.0], [1236.0, 16244.0], [1232.0, 16155.0], [1240.0, 14774.0], [1244.0, 9901.0], [1256.0, 9685.0], [1252.0, 16100.0], [1248.0, 15754.0], [1260.0, 14785.0], [1308.0, 15295.0], [1296.0, 14747.0], [1300.0, 8930.5], [1304.0, 8833.0], [1328.0, 14901.0], [1292.0, 15947.0], [1288.0, 15376.0], [1284.0, 15816.0], [1280.0, 15352.5], [1336.0, 7618.0], [1316.0, 14960.0], [1312.0, 15097.0], [1320.0, 14005.0], [1324.0, 13405.0], [1340.0, 14899.0], [1332.0, 13826.0], [1348.0, 14073.0], [1396.0, 9169.0], [1368.0, 9185.5], [1360.0, 14578.0], [1364.0, 14436.0], [1344.0, 14245.0], [1352.0, 14685.0], [1356.0, 14135.0], [1372.0, 13928.0], [1392.0, 13204.0], [1376.0, 8848.5], [1384.0, 7119.666666666666], [1380.0, 14538.0], [1388.0, 12965.0], [1404.0, 14357.0], [1400.0, 13658.0], [1436.0, 9141.5], [1424.0, 7378.333333333334], [1428.0, 14116.0], [1432.0, 7199.333333333334], [1440.0, 9529.0], [1468.0, 14414.0], [1464.0, 12615.0], [1460.0, 9494.5], [1456.0, 8907.0], [1416.0, 14110.0], [1412.0, 15119.0], [1408.0, 14918.0], [1444.0, 14673.0], [1448.0, 12913.0], [1452.0, 14613.0], [1484.0, 8867.0], [1480.0, 8738.5], [1472.0, 14361.0], [1476.0, 13550.0], [1496.0, 13644.0], [1500.0, 13201.0], [1520.0, 13095.0], [1524.0, 13407.0], [1528.0, 13433.0], [1532.0, 7622.666666666666], [1504.0, 14079.0], [1508.0, 14013.0], [1516.0, 9119.5], [1512.0, 13988.0], [1488.0, 13485.0], [1492.0, 13461.0], [1544.0, 8936.5], [1536.0, 13823.0], [1564.0, 13392.0], [1560.0, 7335.666666666666], [1540.0, 13398.0], [1584.0, 9037.0], [1548.0, 13322.0], [1592.0, 9373.0], [1596.0, 7390.666666666666], [1568.0, 13464.0], [1572.0, 8661.0], [1576.0, 8761.5], [1580.0, 8748.5], [1556.0, 9154.5], [1552.0, 13273.0], [1628.0, 6871.0], [1620.0, 6378.2], [1616.0, 12853.0], [1624.0, 12680.0], [1604.0, 6508.8], [1600.0, 12869.0], [1608.0, 8774.0], [1648.0, 8623.5], [1612.0, 12422.0], [1652.0, 7100.0], [1660.0, 12792.0], [1656.0, 12533.0], [1632.0, 8678.5], [1636.0, 8358.5], [1644.0, 6754.25], [1668.0, 8643.5], [1664.0, 10162.0], [1692.0, 8373.5], [1684.0, 12353.0], [1680.0, 12233.0], [1688.0, 6397.75], [1676.0, 6141.857142857142], [1672.0, 11887.0], [1712.0, 8766.5], [1716.0, 11901.0], [1700.0, 7471.666666666666], [1696.0, 11862.0], [1704.0, 12421.0], [1724.0, 11631.0], [1720.0, 11874.0], [1708.0, 6259.8], [1776.0, 11167.0], [1728.0, 7361.333333333334], [1732.0, 12255.0], [1756.0, 11819.0], [1752.0, 11648.0], [1780.0, 11620.0], [1784.0, 8002.5], [1788.0, 11335.0], [1760.0, 9465.5], [1764.0, 11404.5], [1772.0, 11586.0], [1740.0, 6593.0], [1736.0, 11562.0], [1744.0, 11968.0], [1748.0, 11482.0], [1844.0, 7361.0], [1852.0, 8038.0], [1800.0, 11403.0], [1796.0, 11478.0], [1792.0, 11496.0], [1820.0, 11245.0], [1840.0, 11023.0], [1804.0, 11350.0], [1848.0, 10800.0], [1824.0, 11197.0], [1832.0, 7809.666666666667], [1828.0, 10866.0], [1836.0, 11076.0], [1816.0, 8948.666666666666], [1812.0, 11331.0], [1808.0, 11301.0], [1904.0, 8243.0], [1868.0, 10108.0], [1864.0, 8303.0], [1860.0, 12488.0], [1856.0, 10294.0], [1884.0, 11633.0], [1888.0, 8190.5], [1892.0, 11659.0], [1916.0, 9466.0], [1908.0, 9735.0], [1912.0, 9704.0], [1896.0, 7835.0], [1900.0, 6861.0], [1872.0, 7442.5], [1876.0, 10054.0], [1880.0, 10796.0], [1932.0, 7832.5], [1976.0, 9971.0], [1920.0, 8071.5], [1948.0, 9294.0], [1944.0, 9411.0], [1928.0, 11511.0], [1924.0, 11402.0], [1968.0, 9171.0], [1972.0, 9992.0], [1952.0, 9307.0], [1956.0, 11318.0], [1960.0, 9193.0], [1980.0, 8425.0], [1964.0, 8114.5], [1936.0, 11254.0], [1940.0, 10450.0], [1988.0, 9867.0], [2040.0, 10303.0], [2032.0, 7475.0], [1984.0, 9798.0], [1992.0, 8975.0], [1996.0, 9689.0], [2008.0, 8831.0], [2004.0, 8868.0], [2000.0, 10119.0], [2012.0, 7752.5], [2016.0, 6916.5], [2020.0, 9374.0], [2024.0, 8695.0], [2028.0, 9706.0], [2044.0, 9255.0], [2036.0, 9643.0], [2048.0, 10172.0], [2064.0, 9312.0], [2168.0, 9537.0], [2056.0, 10145.0], [2104.0, 6864.0], [2096.0, 9907.0], [2088.0, 10031.0], [2080.0, 9410.0], [2072.0, 7785.5], [2144.0, 7665.0], [2152.0, 8421.0], [2160.0, 8187.0], [2112.0, 9831.0], [2120.0, 9784.0], [2128.0, 8763.0], [2136.0, 8965.0], [2288.0, 7876.0], [2280.0, 8544.0], [2296.0, 7352.0], [2240.0, 8103.0], [2248.0, 7944.0], [2256.0, 8248.0], [2264.0, 7495.0], [2272.0, 7278.0], [2176.0, 9341.0], [2184.0, 9257.0], [2192.0, 7265.0], [2200.0, 8416.0], [2232.0, 8913.0], [2224.0, 7777.0], [2216.0, 8483.0], [2208.0, 9092.0], [2320.0, 8158.0], [2328.0, 7006.333333333333], [2312.0, 7936.0], [2304.0, 8155.0], [2376.0, 6303.0], [2368.0, 7019.0], [2384.0, 6744.0], [2408.0, 6408.0], [2400.0, 6426.0], [2392.0, 6555.0], [2336.0, 6688.166666666667], [2344.0, 7833.0], [2352.0, 7020.0], [2360.0, 6632.0], [2057.0, 10215.0], [2169.0, 9447.0], [2049.0, 9531.0], [2065.0, 10133.0], [2105.0, 8816.0], [2097.0, 9930.0], [2089.0, 10139.0], [2081.0, 9022.0], [2145.0, 8322.0], [2073.0, 8972.0], [2153.0, 8559.0], [2113.0, 9708.0], [2121.0, 9581.0], [2129.0, 8863.0], [2137.0, 9825.0], [2289.0, 7533.0], [2281.0, 8349.0], [2297.0, 7354.0], [2241.0, 8197.0], [2249.0, 7670.0], [2257.0, 7449.0], [2265.0, 8346.0], [2273.0, 7335.0], [2177.0, 8670.0], [2185.0, 8457.0], [2193.0, 9038.0], [2201.0, 8274.0], [2233.0, 8357.0], [2225.0, 7751.0], [2217.0, 9150.0], [2209.0, 7961.0], [2305.0, 7577.0], [2337.0, 7279.5], [2345.0, 7292.0], [2353.0, 7606.0], [2401.0, 6456.0], [2409.0, 6726.0], [2369.0, 6444.0], [2313.0, 7342.0], [2321.0, 6981.0], [2329.0, 7861.0], [2361.0, 7644.0], [2377.0, 6511.0], [2385.0, 6613.0], [2393.0, 6653.0], [1029.0, 17257.0], [1081.0, 17222.0], [1073.0, 9912.5], [1025.0, 16174.0], [1033.0, 17772.0], [1037.0, 16569.0], [1053.0, 17151.0], [1049.0, 17379.0], [1045.0, 17576.0], [1041.0, 16353.0], [1057.0, 15375.0], [1061.0, 16480.0], [1065.0, 15691.0], [1085.0, 15180.0], [1077.0, 15687.0], [1069.0, 16241.0], [1093.0, 16413.0], [1137.0, 16528.0], [1149.0, 15505.0], [1141.0, 9949.5], [1117.0, 10071.0], [1113.0, 16635.0], [1109.0, 14845.0], [1105.0, 17058.0], [1089.0, 16067.0], [1097.0, 16402.0], [1101.0, 15764.0], [1121.0, 16143.0], [1125.0, 16563.0], [1133.0, 16839.0], [1145.0, 16255.0], [1153.0, 15774.0], [1205.0, 15366.0], [1213.0, 9324.5], [1157.0, 9528.0], [1169.0, 16494.0], [1173.0, 15636.0], [1177.0, 16152.0], [1181.0, 15876.0], [1189.0, 9410.0], [1193.0, 9758.5], [1197.0, 15143.0], [1201.0, 15244.0], [1165.0, 16701.0], [1161.0, 15655.0], [1209.0, 15079.0], [1185.0, 15450.0], [1221.0, 15859.0], [1229.0, 7503.666666666666], [1273.0, 8885.5], [1225.0, 9342.0], [1217.0, 15129.0], [1265.0, 14810.0], [1269.0, 15232.0], [1233.0, 15369.0], [1237.0, 15008.0], [1241.0, 15998.0], [1253.0, 3826.0], [1277.0, 15850.0], [1249.0, 15359.0], [1257.0, 9393.0], [1261.0, 15054.0], [1285.0, 14927.0], [1293.0, 9314.5], [1305.0, 9250.5], [1297.0, 7512.0], [1301.0, 15340.0], [1281.0, 14686.0], [1289.0, 14833.0], [1309.0, 13999.0], [1329.0, 9085.0], [1333.0, 14641.0], [1337.0, 13840.0], [1313.0, 15043.0], [1341.0, 14381.0], [1321.0, 8896.0], [1317.0, 14228.0], [1325.0, 14649.0], [1353.0, 15758.0], [1361.0, 8910.0], [1397.0, 9626.0], [1393.0, 13898.0], [1357.0, 14659.0], [1349.0, 13452.0], [1345.0, 13978.0], [1373.0, 13791.0], [1369.0, 13776.0], [1365.0, 14063.0], [1385.0, 7697.333333333334], [1381.0, 14314.0], [1389.0, 13626.0], [1377.0, 14538.0], [1405.0, 14041.0], [1401.0, 14393.0], [1465.0, 13593.0], [1457.0, 7432.0], [1425.0, 13941.0], [1469.0, 9233.5], [1461.0, 13581.0], [1441.0, 13941.0], [1445.0, 9273.0], [1449.0, 14110.0], [1453.0, 14317.0], [1433.0, 9007.0], [1409.0, 12968.0], [1413.0, 13989.0], [1417.0, 14128.0], [1421.0, 14094.0], [1437.0, 14745.0], [1429.0, 8566.5], [1481.0, 14135.0], [1501.0, 8372.5], [1473.0, 7531.666666666666], [1477.0, 14314.0], [1497.0, 9045.5], [1525.0, 13896.0], [1521.0, 13005.0], [1485.0, 13947.0], [1529.0, 13817.0], [1533.0, 13876.0], [1517.0, 13297.0], [1513.0, 13391.0], [1509.0, 13570.0], [1505.0, 13283.0], [1489.0, 7471.666666666666], [1493.0, 13306.0], [1545.0, 13291.0], [1541.0, 9220.5], [1537.0, 7347.666666666666], [1561.0, 8997.5], [1565.0, 9220.0], [1549.0, 13291.0], [1585.0, 13118.0], [1589.0, 13291.5], [1593.0, 12707.0], [1597.0, 12805.0], [1569.0, 7416.333333333334], [1581.0, 6774.75], [1577.0, 13005.0], [1573.0, 13621.0], [1553.0, 13735.0], [1557.0, 7306.666666666666], [1605.0, 7563.666666666666], [1629.0, 4191.0], [1601.0, 8510.0], [1625.0, 7171.666666666666], [1617.0, 12671.0], [1621.0, 7402.333333333334], [1609.0, 7668.333333333334], [1613.0, 6457.75], [1649.0, 8979.0], [1653.0, 12845.0], [1657.0, 12724.0], [1661.0, 7309.0], [1637.0, 8647.5], [1633.0, 12930.0], [1641.0, 12915.0], [1645.0, 6528.6], [1669.0, 12722.0], [1665.0, 8765.5], [1689.0, 8796.5], [1693.0, 8538.0], [1685.0, 12522.0], [1681.0, 12616.0], [1673.0, 12110.0], [1677.0, 6415.2], [1713.0, 6135.666666666667], [1717.0, 11932.0], [1725.0, 7301.333333333334], [1721.0, 11646.0], [1697.0, 12466.0], [1701.0, 11790.0], [1705.0, 12277.0], [1709.0, 12047.0], [1733.0, 11623.0], [1737.0, 11903.0], [1729.0, 8625.0], [1757.0, 11847.0], [1753.0, 12628.0], [1749.0, 5011.5], [1741.0, 6496.0], [1777.0, 11501.0], [1781.0, 11513.0], [1785.0, 8141.5], [1761.0, 11781.0], [1789.0, 11188.0], [1769.0, 11421.0], [1773.0, 8455.0], [1745.0, 8548.0], [1841.0, 10997.0], [1805.0, 7280.333333333333], [1801.0, 7424.333333333333], [1797.0, 8508.0], [1793.0, 11490.0], [1845.0, 8291.0], [1825.0, 11171.0], [1853.0, 10863.0], [1849.0, 10907.0], [1833.0, 8255.0], [1829.0, 11129.0], [1837.0, 11053.0], [1813.0, 11215.0], [1809.0, 11020.0], [1817.0, 11281.0], [1821.0, 11214.0], [1869.0, 7229.0], [1865.0, 7321.0], [1861.0, 11544.0], [1857.0, 8118.0], [1885.0, 9971.0], [1913.0, 9703.0], [1909.0, 9678.0], [1905.0, 9805.0], [1917.0, 9681.0], [1889.0, 9935.0], [1893.0, 9909.0], [1897.0, 9875.0], [1901.0, 6777.5], [1873.0, 7354.333333333333], [1877.0, 10035.0], [1929.0, 8356.5], [1925.0, 7929.0], [1921.0, 10350.0], [1949.0, 9293.0], [1945.0, 9367.0], [1969.0, 9111.0], [1933.0, 11336.0], [1973.0, 10250.0], [1977.0, 8010.0], [1981.0, 7997.5], [1953.0, 9307.0], [1957.0, 9990.0], [1961.0, 7299.75], [1965.0, 9144.0], [1937.0, 10273.0], [1941.0, 7736.0], [1989.0, 8974.0], [1985.0, 10067.0], [1993.0, 8966.0], [1997.0, 10696.0], [2013.0, 9500.0], [2009.0, 7251.666666666667], [2005.0, 8845.0], [2001.0, 10190.0], [2017.0, 9445.0], [2021.0, 8697.0], [2025.0, 10404.0], [2029.0, 9427.0], [2045.0, 8479.0], [2041.0, 10190.0], [2037.0, 10611.0], [2033.0, 9433.0], [2058.0, 7442.0], [2050.0, 10444.0], [2106.0, 9892.0], [2098.0, 8042.0], [2090.0, 8122.0], [2082.0, 9988.0], [2066.0, 9923.0], [2074.0, 9433.0], [2146.0, 9020.0], [2154.0, 9223.0], [2162.0, 8401.0], [2114.0, 8786.0], [2122.0, 9087.0], [2130.0, 8476.0], [2138.0, 9378.0], [2170.0, 9291.0], [2290.0, 7105.0], [2298.0, 7005.0], [2242.0, 7912.0], [2250.0, 8549.0], [2258.0, 7479.0], [2266.0, 7569.0], [2282.0, 7453.0], [2274.0, 7251.0], [2178.0, 9206.0], [2186.0, 8528.0], [2194.0, 8274.0], [2202.0, 8595.0], [2234.0, 8925.0], [2226.0, 7756.0], [2218.0, 7773.0], [2210.0, 8922.0], [2330.0, 7295.0], [2322.0, 7756.0], [2314.0, 7275.0], [2306.0, 6810.0], [2378.0, 6720.0], [2370.0, 6937.0], [2410.0, 6551.0], [2402.0, 6585.0], [2386.0, 6768.5], [2394.0, 6667.0], [2338.0, 8042.0], [2346.0, 6495.0], [2354.0, 6624.0], [2362.0, 6501.0], [2059.0, 8300.0], [2051.0, 10264.0], [2067.0, 8295.0], [2107.0, 8623.0], [2099.0, 9753.0], [2091.0, 9649.0], [2083.0, 10099.0], [2075.0, 10113.0], [2147.0, 9699.0], [2155.0, 8323.0], [2115.0, 8731.0], [2123.0, 9868.0], [2131.0, 8967.0], [2139.0, 8393.0], [2171.0, 8342.0], [2163.0, 8207.0], [2291.0, 7593.0], [2299.0, 8128.0], [2243.0, 8600.0], [2251.0, 7946.0], [2259.0, 7833.0], [2267.0, 8692.0], [2283.0, 7501.0], [2275.0, 7555.0], [2179.0, 8258.0], [2187.0, 8361.0], [2195.0, 9107.0], [2203.0, 9213.0], [2235.0, 8871.0], [2227.0, 7904.0], [2219.0, 8036.0], [2211.0, 8881.0], [2315.0, 8120.0], [2371.0, 6596.5], [2339.0, 7231.0], [2347.0, 6961.0], [2403.0, 6127.0], [2411.0, 6786.5], [2355.0, 7050.5], [2307.0, 8072.0], [2323.0, 7252.0], [2331.0, 6829.0], [2363.0, 6679.0], [2379.0, 6661.0], [2387.0, 7247.0], [2395.0, 6511.0], [541.0, 21661.0], [543.0, 20614.0], [539.0, 20601.0], [537.0, 19869.0], [535.0, 21763.0], [533.0, 20050.0], [531.0, 20341.0], [529.0, 19632.0], [527.0, 19859.0], [515.0, 19700.0], [513.0, 20496.0], [519.0, 20582.0], [517.0, 23536.0], [525.0, 20241.0], [523.0, 19873.0], [521.0, 19751.0], [573.0, 19877.0], [575.0, 21388.0], [571.0, 20105.0], [569.0, 20274.0], [567.0, 20346.0], [565.0, 19955.0], [563.0, 19160.0], [561.0, 19919.0], [559.0, 19291.0], [547.0, 19808.0], [545.0, 20279.0], [551.0, 19583.0], [549.0, 19883.0], [557.0, 20257.0], [555.0, 20886.0], [553.0, 20265.0], [605.0, 18875.0], [607.0, 19594.0], [603.0, 19043.0], [601.0, 19681.0], [599.0, 19438.0], [597.0, 18893.0], [595.0, 19969.0], [593.0, 20932.0], [591.0, 20430.0], [579.0, 19135.0], [577.0, 20226.0], [583.0, 19229.0], [581.0, 20173.5], [589.0, 19371.0], [587.0, 20998.0], [585.0, 19145.0], [637.0, 18829.0], [639.0, 19401.0], [635.0, 19171.0], [633.0, 19349.0], [631.0, 18576.0], [629.0, 20586.0], [627.0, 19549.0], [625.0, 19699.0], [623.0, 19038.0], [611.0, 18858.0], [609.0, 18838.0], [615.0, 18641.0], [613.0, 19386.0], [621.0, 20548.0], [619.0, 18730.0], [617.0, 21020.0], [669.0, 19320.0], [671.0, 2158.0], [667.0, 19331.0], [665.0, 18653.0], [663.0, 19047.0], [661.0, 18518.0], [659.0, 19235.0], [657.0, 18932.0], [655.0, 20327.0], [643.0, 20774.0], [641.0, 18528.0], [647.0, 21217.0], [645.0, 19068.0], [653.0, 20154.0], [651.0, 18872.0], [649.0, 19205.0], [701.0, 18403.0], [703.0, 17652.0], [699.0, 17383.0], [697.0, 17541.0], [695.0, 18513.0], [693.0, 17946.0], [691.0, 19046.0], [689.0, 19183.0], [687.0, 20671.0], [675.0, 18812.0], [673.0, 18639.0], [679.0, 19786.0], [677.0, 18397.0], [685.0, 19469.0], [683.0, 19324.0], [681.0, 19062.0], [733.0, 18229.0], [735.0, 18096.0], [731.0, 17997.0], [729.0, 18397.0], [727.0, 17612.0], [725.0, 18459.0], [723.0, 18134.0], [721.0, 19407.0], [719.0, 17393.0], [705.0, 19067.0], [711.0, 17371.0], [707.0, 17750.0], [717.0, 19156.0], [715.0, 18553.0], [713.0, 17431.0], [763.0, 17052.0], [741.0, 10399.0], [767.0, 17664.0], [761.0, 18944.0], [743.0, 19072.0], [759.0, 19833.0], [757.0, 20388.0], [755.0, 20095.0], [753.0, 20046.0], [751.0, 17956.0], [739.0, 18276.0], [737.0, 18149.0], [749.0, 17349.0], [747.0, 18312.0], [745.0, 18337.0], [797.0, 18079.0], [799.0, 18161.0], [795.0, 17863.0], [793.0, 18523.0], [789.0, 18321.0], [787.0, 18400.0], [785.0, 16800.0], [783.0, 17418.0], [771.0, 18384.0], [769.0, 18429.0], [775.0, 18263.0], [773.0, 16889.0], [781.0, 17094.0], [779.0, 17348.0], [777.0, 17404.0], [829.0, 17375.0], [805.0, 10786.5], [801.0, 16932.0], [807.0, 18960.0], [815.0, 18656.0], [813.0, 17642.0], [811.0, 18451.0], [809.0, 16789.0], [831.0, 18728.0], [827.0, 16497.0], [825.0, 17682.0], [823.0, 16533.0], [821.0, 17737.0], [819.0, 17537.0], [817.0, 19723.0], [861.0, 19218.0], [863.0, 17640.0], [859.0, 17233.0], [857.0, 17466.0], [855.0, 17358.0], [853.0, 18756.0], [851.0, 19758.0], [849.0, 18713.0], [847.0, 17464.0], [835.0, 18304.0], [833.0, 17365.0], [839.0, 17698.0], [837.0, 17098.0], [845.0, 18135.0], [843.0, 18807.0], [841.0, 19977.0], [893.0, 16758.0], [867.0, 9946.0], [865.0, 18218.0], [871.0, 19425.0], [869.0, 18227.0], [879.0, 18845.0], [877.0, 18503.0], [875.0, 18357.0], [873.0, 18106.0], [895.0, 17653.0], [891.0, 18776.0], [889.0, 16843.0], [887.0, 19485.0], [885.0, 18282.0], [883.0, 17175.0], [881.0, 17076.0], [911.0, 10297.0], [907.0, 9740.0], [905.0, 17881.0], [909.0, 19036.0], [921.0, 10017.0], [901.0, 19161.0], [899.0, 18905.0], [897.0, 18043.0], [923.0, 10600.5], [927.0, 16660.0], [913.0, 17532.0], [915.0, 17415.0], [917.0, 19170.0], [925.0, 16762.0], [935.0, 19024.0], [957.0, 10397.5], [929.0, 16947.0], [931.0, 17642.0], [933.0, 18214.0], [941.0, 16417.0], [937.0, 16757.0], [945.0, 16613.0], [947.0, 16399.0], [949.0, 16475.0], [951.0, 10311.5], [959.0, 10202.5], [955.0, 7845.666666666667], [953.0, 16269.0], [963.0, 6431.5], [965.0, 10785.5], [973.0, 10623.0], [961.0, 12765.333333333334], [975.0, 18020.0], [971.0, 10217.0], [969.0, 11005.0], [967.0, 7992.0], [985.0, 16950.0], [987.0, 17538.0], [977.0, 17442.0], [979.0, 15958.0], [981.0, 18498.0], [983.0, 17444.0], [989.0, 16738.0], [1021.0, 16695.0], [1023.0, 17237.0], [1009.0, 17943.0], [1011.0, 16295.0], [1013.0, 16163.0], [1019.0, 16029.0], [1017.0, 16991.0], [1007.0, 15963.0], [993.0, 17469.0], [995.0, 16105.0], [997.0, 18483.0], [999.0, 18264.0], [1005.0, 17308.5], [1003.0, 18248.0], [1001.0, 16489.0], [1015.0, 16972.0], [1082.0, 15495.0], [1086.0, 15822.0], [1058.0, 16160.0], [1062.0, 16072.0], [1066.0, 16554.0], [1078.0, 17296.0], [1074.0, 16423.0], [1054.0, 15513.0], [1030.0, 16540.0], [1034.0, 17734.0], [1038.0, 15673.0], [1050.0, 16272.0], [1046.0, 15798.0], [1042.0, 16170.0], [1070.0, 15806.0], [1094.0, 7543.0], [1090.0, 16738.0], [1118.0, 16049.0], [1114.0, 16936.0], [1110.0, 17254.0], [1106.0, 15017.0], [1150.0, 16122.0], [1122.0, 16510.0], [1126.0, 15483.0], [1130.0, 15861.0], [1134.0, 16225.0], [1146.0, 16792.0], [1142.0, 16873.0], [1138.0, 15043.0], [1102.0, 16895.0], [1098.0, 16531.0], [1210.0, 14944.0], [1198.0, 7566.666666666666], [1214.0, 14439.0], [1186.0, 16122.0], [1190.0, 14869.0], [1194.0, 15441.0], [1206.0, 15220.0], [1202.0, 14969.0], [1182.0, 15524.0], [1154.0, 15174.0], [1158.0, 15137.0], [1162.0, 15921.0], [1166.0, 15782.0], [1178.0, 16431.0], [1174.0, 15841.0], [1170.0, 15296.0], [1218.0, 15319.0], [1274.0, 14381.0], [1266.0, 9999.5], [1222.0, 9474.5], [1246.0, 15848.5], [1230.0, 16166.0], [1226.0, 15474.0], [1270.0, 9563.0], [1278.0, 9631.5], [1238.0, 9929.5], [1234.0, 15185.0], [1242.0, 14695.0], [1254.0, 15106.0], [1250.0, 15766.0], [1258.0, 14804.0], [1262.0, 15968.0], [1282.0, 16232.0], [1330.0, 3677.0], [1298.0, 9258.5], [1302.0, 15337.0], [1306.0, 14921.0], [1290.0, 15993.0], [1286.0, 16120.0], [1310.0, 14972.0], [1342.0, 14873.0], [1318.0, 13604.0], [1326.0, 15217.0], [1338.0, 14934.0], [1334.0, 14114.0], [1374.0, 14426.0], [1362.0, 9234.5], [1366.0, 15371.0], [1370.0, 9179.0], [1346.0, 13652.0], [1350.0, 14002.0], [1354.0, 14387.0], [1358.0, 14755.0], [1394.0, 13320.0], [1378.0, 13591.0], [1386.0, 13411.0], [1390.0, 13048.0], [1406.0, 14337.0], [1402.0, 14378.0], [1398.0, 14186.0], [1418.0, 10814.0], [1462.0, 8897.0], [1434.0, 9086.0], [1430.0, 6810.0], [1426.0, 6609.0], [1438.0, 8941.0], [1470.0, 13059.0], [1466.0, 13646.0], [1422.0, 14768.0], [1414.0, 14365.0], [1410.0, 13967.0], [1458.0, 13993.0], [1446.0, 7229.666666666666], [1442.0, 13347.0], [1450.0, 14654.0], [1454.0, 13526.0], [1478.0, 14339.0], [1526.0, 8872.0], [1502.0, 8674.5], [1494.0, 7623.666666666666], [1474.0, 9145.0], [1498.0, 9026.5], [1482.0, 13559.0], [1486.0, 14208.0], [1522.0, 13941.0], [1530.0, 8834.0], [1510.0, 6808.75], [1534.0, 12836.0], [1506.0, 13143.0], [1514.0, 13511.0], [1518.0, 13906.0], [1490.0, 6610.25], [1542.0, 7597.666666666666], [1538.0, 9144.0], [1566.0, 8901.0], [1562.0, 13217.0], [1550.0, 13732.0], [1546.0, 13809.0], [1586.0, 8789.0], [1594.0, 8559.0], [1590.0, 12820.0], [1598.0, 8690.5], [1570.0, 13632.0], [1574.0, 9056.0], [1578.0, 12981.0], [1582.0, 12766.0], [1554.0, 12996.0], [1558.0, 13049.0], [1606.0, 8622.0], [1630.0, 10170.0], [1618.0, 13102.0], [1622.0, 12690.0], [1626.0, 12702.0], [1602.0, 13103.0], [1610.0, 7614.333333333334], [1614.0, 12355.0], [1650.0, 12761.0], [1662.0, 8512.0], [1658.0, 12176.0], [1654.0, 12914.0], [1634.0, 12977.0], [1638.0, 12336.0], [1642.0, 6576.25], [1646.0, 8799.5], [1670.0, 8567.5], [1678.0, 7477.666666666666], [1694.0, 7072.333333333334], [1690.0, 12435.0], [1686.0, 6806.75], [1682.0, 12037.0], [1666.0, 11943.0], [1718.0, 8564.0], [1714.0, 12165.0], [1698.0, 12449.0], [1702.0, 12166.0], [1726.0, 11963.0], [1722.0, 12318.0], [1706.0, 8790.0], [1710.0, 12396.0], [1742.0, 6648.5], [1734.0, 7263.666666666666], [1730.0, 11870.0], [1758.0, 7275.0], [1750.0, 9515.0], [1754.0, 11839.0], [1782.0, 11305.0], [1778.0, 11483.0], [1790.0, 8303.0], [1786.0, 11556.0], [1762.0, 7652.666666666667], [1766.0, 6692.500000000001], [1774.0, 8021.5], [1770.0, 11618.0], [1738.0, 11824.0], [1746.0, 9658.5], [1806.0, 13188.0], [1822.0, 6904.5], [1798.0, 11435.0], [1802.0, 7495.0], [1842.0, 11010.0], [1846.0, 11829.0], [1850.0, 10720.0], [1854.0, 7126.25], [1826.0, 8429.5], [1838.0, 7346.666666666667], [1830.0, 11134.0], [1834.0, 11003.0], [1814.0, 11287.0], [1810.0, 11343.0], [1818.0, 8256.5], [1914.0, 7168.0], [1918.0, 6815.333333333333], [1862.0, 10818.0], [1858.0, 10871.0], [1866.0, 10828.0], [1870.0, 10103.0], [1886.0, 9939.0], [1890.0, 11853.0], [1894.0, 9874.0], [1910.0, 8214.0], [1898.0, 11599.0], [1874.0, 10054.0], [1878.0, 11123.0], [1882.0, 8138.5], [1930.0, 11707.0], [1922.0, 7925.333333333333], [1950.0, 9299.0], [1926.0, 11637.0], [1934.0, 11297.0], [1970.0, 10779.0], [1974.0, 10769.0], [1978.0, 10783.0], [1982.0, 6795.0], [1954.0, 9274.0], [1958.0, 9247.0], [1962.0, 11275.0], [1966.0, 9153.0], [1938.0, 8493.5], [1942.0, 8723.5], [1990.0, 8204.0], [2014.0, 9559.0], [2042.0, 9313.0], [1986.0, 8998.0], [1994.0, 8971.0], [1998.0, 10623.0], [2006.0, 9715.0], [2002.0, 10984.0], [2010.0, 10685.0], [2018.0, 10396.0], [2022.0, 8689.0], [2026.0, 9777.0], [2030.0, 9436.0], [2046.0, 8386.5], [2038.0, 8552.0], [2034.0, 8591.0], [2060.0, 9264.0], [2052.0, 8363.0], [2108.0, 9058.0], [2092.0, 8932.0], [2084.0, 9040.0], [2068.0, 10144.0], [2076.0, 10350.0], [2156.0, 9391.0], [2116.0, 9702.0], [2124.0, 8628.0], [2132.0, 8912.0], [2140.0, 8695.0], [2172.0, 9052.0], [2164.0, 9543.0], [2300.0, 7715.0], [2244.0, 7826.0], [2252.0, 7844.0], [2260.0, 8105.0], [2268.0, 7552.0], [2292.0, 7242.0], [2284.0, 8351.0], [2276.0, 8528.0], [2180.0, 9324.0], [2188.0, 8389.0], [2196.0, 9232.0], [2204.0, 8654.0], [2236.0, 8339.0], [2228.0, 8664.0], [2220.0, 8891.0], [2212.0, 8979.0], [2332.0, 6747.0], [2324.0, 7111.5], [2316.0, 7518.0], [2308.0, 8252.0], [2380.0, 6680.0], [2372.0, 6924.0], [2412.0, 6495.0], [2404.0, 7041.0], [2388.0, 6702.0], [2396.0, 6442.0], [2340.0, 7153.0], [2356.0, 6847.0], [2348.0, 6698.0], [2364.0, 6996.0], [2053.0, 10015.0], [2109.0, 9874.0], [2061.0, 10339.0], [2069.0, 8263.0], [2101.0, 9697.0], [2093.0, 9712.0], [2085.0, 8154.0], [2077.0, 9914.0], [2149.0, 8597.5], [2157.0, 8457.0], [2117.0, 9937.0], [2125.0, 8486.0], [2133.0, 8919.0], [2141.0, 9538.0], [2173.0, 8152.0], [2165.0, 9197.0], [2301.0, 7654.0], [2245.0, 8345.0], [2253.0, 8102.0], [2261.0, 7589.0], [2269.0, 7627.0], [2293.0, 8212.0], [2285.0, 8310.0], [2277.0, 8469.0], [2181.0, 8196.0], [2189.0, 8660.0], [2197.0, 8003.0], [2205.0, 8645.0], [2237.0, 8076.0], [2229.0, 7695.0], [2221.0, 8168.0], [2213.0, 8015.0], [2333.0, 6685.0], [2405.0, 6594.333333333333], [2341.0, 6909.0], [2413.0, 6341.0], [2365.0, 6700.5], [2309.0, 7195.0], [2317.0, 6800.0], [2325.0, 7125.0], [2357.0, 6502.0], [2373.0, 6762.0], [2381.0, 6744.0], [2389.0, 6448.0], [2397.0, 6471.0], [1027.0, 17566.5], [1055.0, 16278.0], [1031.0, 16041.0], [1035.0, 17956.0], [1039.0, 16197.0], [1051.0, 15587.0], [1047.0, 15687.0], [1043.0, 17916.0], [1087.0, 15499.0], [1059.0, 17118.0], [1063.0, 16661.0], [1067.0, 16356.0], [1083.0, 16123.0], [1079.0, 16257.0], [1075.0, 17496.0], [1071.0, 17379.0], [1119.0, 15860.0], [1115.0, 16847.0], [1111.0, 15164.0], [1107.0, 16910.0], [1091.0, 17016.0], [1095.0, 15010.0], [1099.0, 16453.0], [1103.0, 16699.0], [1151.0, 16393.0], [1123.0, 16562.0], [1131.0, 16385.0], [1127.0, 15947.0], [1135.0, 16018.0], [1147.0, 16796.0], [1143.0, 15576.0], [1139.0, 16011.0], [1183.0, 16025.0], [1171.0, 7401.666666666666], [1175.0, 15441.0], [1179.0, 16239.0], [1155.0, 16502.0], [1191.0, 15686.0], [1195.0, 14738.0], [1199.0, 15170.0], [1203.0, 9528.0], [1167.0, 16559.0], [1163.0, 15501.0], [1159.0, 16270.0], [1207.0, 15697.0], [1211.0, 15753.0], [1215.0, 9806.5], [1187.0, 15964.0], [1223.0, 16129.0], [1219.0, 14945.0], [1227.0, 14502.0], [1267.0, 9809.0], [1231.0, 14798.0], [1271.0, 14636.0], [1235.0, 9618.0], [1239.0, 15209.0], [1243.0, 16087.0], [1247.0, 15688.0], [1251.0, 14911.0], [1275.0, 16060.0], [1255.0, 15825.0], [1259.0, 16041.0], [1263.0, 14631.0], [1311.0, 15376.0], [1299.0, 15042.0], [1303.0, 15340.0], [1307.0, 9370.0], [1283.0, 14815.0], [1287.0, 15932.0], [1315.0, 11038.333333333334], [1295.0, 15277.0], [1331.0, 14513.5], [1335.0, 14895.0], [1339.0, 14746.0], [1343.0, 14510.0], [1319.0, 14113.0], [1323.0, 10696.666666666666], [1327.0, 14744.0], [1355.0, 13955.0], [1399.0, 7235.666666666666], [1363.0, 8824.0], [1395.0, 13666.0], [1359.0, 14812.0], [1351.0, 14112.0], [1347.0, 14211.0], [1375.0, 14775.0], [1367.0, 14108.0], [1379.0, 9150.5], [1383.0, 13794.5], [1387.0, 14645.0], [1391.0, 13689.0], [1407.0, 14105.0], [1403.0, 14453.0], [1471.0, 14162.0], [1427.0, 7479.333333333334], [1467.0, 13549.0], [1463.0, 13955.0], [1459.0, 14563.0], [1443.0, 12594.0], [1447.0, 8697.5], [1451.0, 14623.0], [1455.0, 7546.0], [1435.0, 14438.0], [1439.0, 13875.0], [1411.0, 14236.0], [1415.0, 14650.0], [1419.0, 13074.0], [1423.0, 12875.0], [1431.0, 9040.5], [1479.0, 13564.0], [1531.0, 13265.0], [1475.0, 13678.0], [1503.0, 13576.0], [1495.0, 9346.0], [1499.0, 13594.0], [1483.0, 8561.0], [1527.0, 8860.0], [1523.0, 13906.0], [1487.0, 14261.0], [1535.0, 8247.5], [1519.0, 8825.0], [1515.0, 13425.0], [1511.0, 13683.0], [1507.0, 14017.0], [1491.0, 7517.666666666666], [1543.0, 8887.5], [1539.0, 13560.0], [1567.0, 7472.0], [1563.0, 13468.0], [1559.0, 8850.5], [1551.0, 7424.333333333334], [1587.0, 8807.0], [1591.0, 12914.0], [1595.0, 6671.25], [1599.0, 7552.0], [1579.0, 13148.0], [1575.0, 13232.0], [1571.0, 12901.0], [1583.0, 12621.0], [1555.0, 8831.0], [1603.0, 12622.0], [1611.0, 8558.5], [1631.0, 12508.0], [1627.0, 12827.0], [1623.0, 8935.0], [1619.0, 9140.0], [1607.0, 13220.0], [1615.0, 8719.5], [1651.0, 12882.0], [1655.0, 12160.0], [1659.0, 8554.5], [1663.0, 5399.0], [1635.0, 12634.0], [1639.0, 12558.0], [1643.0, 7516.0], [1647.0, 12616.0], [1671.0, 7473.333333333334], [1679.0, 6860.75], [1691.0, 8490.0], [1695.0, 11906.0], [1687.0, 7511.333333333334], [1683.0, 12472.0], [1667.0, 12765.0], [1675.0, 9704.333333333334], [1715.0, 11767.0], [1719.0, 8334.0], [1723.0, 12043.0], [1727.0, 11676.0], [1699.0, 11697.0], [1703.0, 12313.0], [1711.0, 8730.0], [1707.0, 8807.0], [1735.0, 9343.0], [1739.0, 8602.0], [1731.0, 12214.0], [1759.0, 8709.5], [1755.0, 11861.0], [1751.0, 11641.0], [1743.0, 11326.0], [1779.0, 11629.0], [1783.0, 11009.0], [1763.0, 5058.0], [1791.0, 11455.0], [1787.0, 11131.0], [1767.0, 7210.333333333334], [1771.0, 8088.0], [1775.0, 8487.5], [1747.0, 11761.0], [1843.0, 8547.5], [1807.0, 7055.25], [1803.0, 11236.0], [1795.0, 11459.5], [1799.0, 11322.0], [1823.0, 7237.333333333333], [1827.0, 6333.333333333334], [1855.0, 12691.0], [1851.0, 10555.0], [1847.0, 10594.0], [1831.0, 11126.0], [1835.0, 11102.0], [1839.0, 12769.0], [1815.0, 4514.0], [1811.0, 10934.0], [1819.0, 10871.0], [1907.0, 9531.0], [1915.0, 6164.0], [1863.0, 7466.0], [1859.0, 10716.0], [1887.0, 7305.666666666667], [1867.0, 8083.5], [1919.0, 6979.333333333333], [1911.0, 11827.0], [1871.0, 10128.0], [1891.0, 6754.8], [1895.0, 9898.0], [1899.0, 9854.0], [1903.0, 10540.5], [1875.0, 10057.0], [1879.0, 9997.0], [1883.0, 6450.0], [1935.0, 10695.0], [1975.0, 8290.5], [1923.0, 10496.0], [1927.0, 9594.0], [1951.0, 9304.0], [1947.0, 11058.5], [1943.0, 9427.0], [1971.0, 8350.0], [1931.0, 9562.0], [1979.0, 9041.0], [1983.0, 7859.5], [1955.0, 9272.0], [1959.0, 11004.0], [1967.0, 9115.0], [1963.0, 9161.0], [1939.0, 6530.0], [1987.0, 10741.0], [2043.0, 10371.0], [2015.0, 9987.0], [1991.0, 9662.0], [1995.0, 8934.0], [2007.0, 9502.0], [2003.0, 8869.0], [2011.0, 9680.0], [2019.0, 7397.5], [2023.0, 9933.0], [2027.0, 8449.5], [2031.0, 10556.0], [2039.0, 8549.0], [2035.0, 9342.0], [1999.0, 10570.0], [2047.0, 10185.0], [2070.0, 9181.0], [2150.0, 8619.0], [2054.0, 7252.5], [2110.0, 8865.0], [2102.0, 9773.0], [2094.0, 6948.0], [2086.0, 8838.0], [2062.0, 10188.0], [2078.0, 10136.0], [2174.0, 8930.0], [2118.0, 9627.0], [2126.0, 9688.0], [2134.0, 8733.0], [2142.0, 8794.0], [2166.0, 9544.0], [2294.0, 8062.0], [2302.0, 7189.0], [2246.0, 7558.0], [2254.0, 8730.0], [2262.0, 8465.0], [2270.0, 7779.0], [2286.0, 8328.0], [2278.0, 7943.0], [2238.0, 7559.0], [2182.0, 9296.0], [2190.0, 8933.0], [2198.0, 8324.0], [2206.0, 8728.0], [2230.0, 8016.0], [2222.0, 8883.0], [2214.0, 7942.0], [2334.0, 6328.333333333333], [2406.0, 6466.333333333333], [2318.0, 7278.0], [2310.0, 7928.0], [2326.0, 7951.0], [2382.0, 6573.333333333333], [2374.0, 6504.0], [2390.0, 6782.0], [2398.0, 6660.0], [2342.0, 7849.0], [2350.0, 7026.5], [2358.0, 7158.0], [2366.0, 6437.0], [2063.0, 8300.0], [2079.0, 9261.0], [2151.0, 9259.0], [2071.0, 6578.333333333333], [2055.0, 10368.0], [2103.0, 9628.0], [2095.0, 8867.0], [2087.0, 9084.0], [2175.0, 8356.0], [2119.0, 8783.0], [2127.0, 9684.0], [2135.0, 8871.0], [2143.0, 9285.0], [2167.0, 9133.0], [2159.0, 9426.5], [2295.0, 7136.0], [2303.0, 8047.0], [2247.0, 8869.0], [2255.0, 7809.0], [2263.0, 7972.0], [2271.0, 7556.0], [2287.0, 7490.0], [2279.0, 7716.0], [2239.0, 8786.0], [2183.0, 8371.0], [2191.0, 7994.0], [2199.0, 9218.0], [2207.0, 8211.0], [2231.0, 8151.0], [2223.0, 7811.0], [2215.0, 7745.0], [2319.0, 7407.0], [2343.0, 7819.0], [2351.0, 7070.0], [2335.0, 7127.5], [2407.0, 6493.0], [2311.0, 7142.0], [2327.0, 7726.0], [2359.0, 6498.0], [2375.0, 7351.0], [2383.0, 7057.5], [2391.0, 6257.0], [2399.0, 7317.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1265.6560000000015, 13476.739000000016]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2413.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18750.0, "minX": 1.54960812E12, "maxY": 21047.316666666666, "series": [{"data": [[1.54960812E12, 21047.316666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960812E12, 18750.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 13476.739000000016, "minX": 1.54960812E12, "maxY": 13476.739000000016, "series": [{"data": [[1.54960812E12, 13476.739000000016]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 13476.733000000022, "minX": 1.54960812E12, "maxY": 13476.733000000022, "series": [{"data": [[1.54960812E12, 13476.733000000022]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 128.77466666666635, "minX": 1.54960812E12, "maxY": 128.77466666666635, "series": [{"data": [[1.54960812E12, 128.77466666666635]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 531.0, "minX": 1.54960812E12, "maxY": 26205.0, "series": [{"data": [[1.54960812E12, 26205.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960812E12, 531.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960812E12, 22702.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960812E12, 25538.609999999993]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960812E12, 24048.299999999996]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 13580.0, "minX": 50.0, "maxY": 13580.0, "series": [{"data": [[50.0, 13580.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 13580.0, "minX": 50.0, "maxY": 13580.0, "series": [{"data": [[50.0, 13580.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960812E12, "maxY": 50.0, "series": [{"data": [[1.54960812E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960812E12, "maxY": 50.0, "series": [{"data": [[1.54960812E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960812E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54960812E12, "maxY": 50.0, "series": [{"data": [[1.54960812E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960812E12, "title": "Transactions Per Second"}},
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
