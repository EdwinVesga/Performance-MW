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
        data: {"result": {"minY": 338.0, "minX": 0.0, "maxY": 14701.0, "series": [{"data": [[0.0, 338.0], [0.1, 360.0], [0.2, 369.0], [0.3, 413.0], [0.4, 429.0], [0.5, 440.0], [0.6, 445.0], [0.7, 450.0], [0.8, 470.0], [0.9, 479.0], [1.0, 491.0], [1.1, 502.0], [1.2, 506.0], [1.3, 520.0], [1.4, 523.0], [1.5, 554.0], [1.6, 558.0], [1.7, 591.0], [1.8, 614.0], [1.9, 635.0], [2.0, 658.0], [2.1, 722.0], [2.2, 761.0], [2.3, 788.0], [2.4, 843.0], [2.5, 879.0], [2.6, 965.0], [2.7, 1018.0], [2.8, 1051.0], [2.9, 1072.0], [3.0, 1078.0], [3.1, 1086.0], [3.2, 1119.0], [3.3, 1153.0], [3.4, 1187.0], [3.5, 1220.0], [3.6, 1234.0], [3.7, 1262.0], [3.8, 1291.0], [3.9, 1328.0], [4.0, 1332.0], [4.1, 1372.0], [4.2, 1421.0], [4.3, 1491.0], [4.4, 1517.0], [4.5, 1539.0], [4.6, 1588.0], [4.7, 1624.0], [4.8, 1694.0], [4.9, 1704.0], [5.0, 1715.0], [5.1, 1737.0], [5.2, 1764.0], [5.3, 1813.0], [5.4, 1836.0], [5.5, 1911.0], [5.6, 1991.0], [5.7, 2016.0], [5.8, 2022.0], [5.9, 2049.0], [6.0, 2099.0], [6.1, 2176.0], [6.2, 2236.0], [6.3, 2305.0], [6.4, 2358.0], [6.5, 2368.0], [6.6, 2376.0], [6.7, 2424.0], [6.8, 2468.0], [6.9, 2515.0], [7.0, 2569.0], [7.1, 2577.0], [7.2, 2605.0], [7.3, 2621.0], [7.4, 2647.0], [7.5, 2662.0], [7.6, 2688.0], [7.7, 2817.0], [7.8, 2938.0], [7.9, 2997.0], [8.0, 3076.0], [8.1, 3103.0], [8.2, 3145.0], [8.3, 3165.0], [8.4, 3176.0], [8.5, 3201.0], [8.6, 3233.0], [8.7, 3257.0], [8.8, 3271.0], [8.9, 3279.0], [9.0, 3334.0], [9.1, 3356.0], [9.2, 3387.0], [9.3, 3395.0], [9.4, 3415.0], [9.5, 3442.0], [9.6, 3459.0], [9.7, 3461.0], [9.8, 3467.0], [9.9, 3478.0], [10.0, 3492.0], [10.1, 3496.0], [10.2, 3506.0], [10.3, 3516.0], [10.4, 3525.0], [10.5, 3542.0], [10.6, 3547.0], [10.7, 3548.0], [10.8, 3550.0], [10.9, 3552.0], [11.0, 3562.0], [11.1, 3572.0], [11.2, 3579.0], [11.3, 3588.0], [11.4, 3601.0], [11.5, 3626.0], [11.6, 3638.0], [11.7, 3649.0], [11.8, 3662.0], [11.9, 3667.0], [12.0, 3674.0], [12.1, 3675.0], [12.2, 3694.0], [12.3, 3720.0], [12.4, 3729.0], [12.5, 3735.0], [12.6, 3748.0], [12.7, 3763.0], [12.8, 3769.0], [12.9, 3774.0], [13.0, 3791.0], [13.1, 3791.0], [13.2, 3796.0], [13.3, 3807.0], [13.4, 3818.0], [13.5, 3833.0], [13.6, 3853.0], [13.7, 3854.0], [13.8, 3862.0], [13.9, 3866.0], [14.0, 3878.0], [14.1, 3888.0], [14.2, 3913.0], [14.3, 3924.0], [14.4, 3928.0], [14.5, 3929.0], [14.6, 3934.0], [14.7, 3961.0], [14.8, 3972.0], [14.9, 3974.0], [15.0, 3996.0], [15.1, 4027.0], [15.2, 4057.0], [15.3, 4062.0], [15.4, 4089.0], [15.5, 4093.0], [15.6, 4096.0], [15.7, 4110.0], [15.8, 4119.0], [15.9, 4134.0], [16.0, 4136.0], [16.1, 4145.0], [16.2, 4151.0], [16.3, 4182.0], [16.4, 4188.0], [16.5, 4207.0], [16.6, 4211.0], [16.7, 4224.0], [16.8, 4226.0], [16.9, 4249.0], [17.0, 4260.0], [17.1, 4266.0], [17.2, 4278.0], [17.3, 4295.0], [17.4, 4304.0], [17.5, 4319.0], [17.6, 4323.0], [17.7, 4341.0], [17.8, 4364.0], [17.9, 4384.0], [18.0, 4399.0], [18.1, 4402.0], [18.2, 4407.0], [18.3, 4412.0], [18.4, 4416.0], [18.5, 4422.0], [18.6, 4428.0], [18.7, 4445.0], [18.8, 4466.0], [18.9, 4477.0], [19.0, 4495.0], [19.1, 4500.0], [19.2, 4505.0], [19.3, 4516.0], [19.4, 4529.0], [19.5, 4541.0], [19.6, 4558.0], [19.7, 4570.0], [19.8, 4578.0], [19.9, 4585.0], [20.0, 4604.0], [20.1, 4624.0], [20.2, 4637.0], [20.3, 4644.0], [20.4, 4676.0], [20.5, 4681.0], [20.6, 4684.0], [20.7, 4696.0], [20.8, 4703.0], [20.9, 4704.0], [21.0, 4716.0], [21.1, 4720.0], [21.2, 4730.0], [21.3, 4737.0], [21.4, 4750.0], [21.5, 4764.0], [21.6, 4777.0], [21.7, 4780.0], [21.8, 4790.0], [21.9, 4792.0], [22.0, 4806.0], [22.1, 4811.0], [22.2, 4825.0], [22.3, 4840.0], [22.4, 4868.0], [22.5, 4879.0], [22.6, 4887.0], [22.7, 4899.0], [22.8, 4936.0], [22.9, 4942.0], [23.0, 4954.0], [23.1, 4961.0], [23.2, 4973.0], [23.3, 4982.0], [23.4, 4993.0], [23.5, 5001.0], [23.6, 5015.0], [23.7, 5031.0], [23.8, 5039.0], [23.9, 5042.0], [24.0, 5059.0], [24.1, 5066.0], [24.2, 5073.0], [24.3, 5085.0], [24.4, 5088.0], [24.5, 5096.0], [24.6, 5108.0], [24.7, 5116.0], [24.8, 5133.0], [24.9, 5140.0], [25.0, 5158.0], [25.1, 5169.0], [25.2, 5184.0], [25.3, 5196.0], [25.4, 5210.0], [25.5, 5228.0], [25.6, 5242.0], [25.7, 5276.0], [25.8, 5281.0], [25.9, 5285.0], [26.0, 5301.0], [26.1, 5305.0], [26.2, 5316.0], [26.3, 5333.0], [26.4, 5345.0], [26.5, 5382.0], [26.6, 5404.0], [26.7, 5418.0], [26.8, 5423.0], [26.9, 5425.0], [27.0, 5438.0], [27.1, 5445.0], [27.2, 5462.0], [27.3, 5468.0], [27.4, 5478.0], [27.5, 5483.0], [27.6, 5492.0], [27.7, 5496.0], [27.8, 5504.0], [27.9, 5523.0], [28.0, 5545.0], [28.1, 5550.0], [28.2, 5557.0], [28.3, 5573.0], [28.4, 5578.0], [28.5, 5595.0], [28.6, 5602.0], [28.7, 5613.0], [28.8, 5626.0], [28.9, 5642.0], [29.0, 5648.0], [29.1, 5677.0], [29.2, 5687.0], [29.3, 5693.0], [29.4, 5702.0], [29.5, 5717.0], [29.6, 5756.0], [29.7, 5766.0], [29.8, 5785.0], [29.9, 5787.0], [30.0, 5801.0], [30.1, 5814.0], [30.2, 5832.0], [30.3, 5856.0], [30.4, 5864.0], [30.5, 5878.0], [30.6, 5901.0], [30.7, 5916.0], [30.8, 5921.0], [30.9, 5924.0], [31.0, 5932.0], [31.1, 5950.0], [31.2, 5955.0], [31.3, 5981.0], [31.4, 5993.0], [31.5, 6019.0], [31.6, 6038.0], [31.7, 6079.0], [31.8, 6098.0], [31.9, 6116.0], [32.0, 6121.0], [32.1, 6127.0], [32.2, 6143.0], [32.3, 6147.0], [32.4, 6148.0], [32.5, 6155.0], [32.6, 6189.0], [32.7, 6197.0], [32.8, 6216.0], [32.9, 6225.0], [33.0, 6236.0], [33.1, 6259.0], [33.2, 6272.0], [33.3, 6283.0], [33.4, 6330.0], [33.5, 6346.0], [33.6, 6357.0], [33.7, 6386.0], [33.8, 6403.0], [33.9, 6448.0], [34.0, 6453.0], [34.1, 6462.0], [34.2, 6465.0], [34.3, 6475.0], [34.4, 6486.0], [34.5, 6501.0], [34.6, 6523.0], [34.7, 6536.0], [34.8, 6541.0], [34.9, 6551.0], [35.0, 6555.0], [35.1, 6568.0], [35.2, 6578.0], [35.3, 6586.0], [35.4, 6593.0], [35.5, 6625.0], [35.6, 6637.0], [35.7, 6642.0], [35.8, 6660.0], [35.9, 6663.0], [36.0, 6668.0], [36.1, 6673.0], [36.2, 6689.0], [36.3, 6691.0], [36.4, 6719.0], [36.5, 6724.0], [36.6, 6728.0], [36.7, 6737.0], [36.8, 6744.0], [36.9, 6754.0], [37.0, 6762.0], [37.1, 6775.0], [37.2, 6778.0], [37.3, 6792.0], [37.4, 6797.0], [37.5, 6803.0], [37.6, 6817.0], [37.7, 6827.0], [37.8, 6843.0], [37.9, 6861.0], [38.0, 6863.0], [38.1, 6865.0], [38.2, 6877.0], [38.3, 6884.0], [38.4, 6893.0], [38.5, 6913.0], [38.6, 6927.0], [38.7, 6950.0], [38.8, 6961.0], [38.9, 6970.0], [39.0, 6979.0], [39.1, 6988.0], [39.2, 7002.0], [39.3, 7008.0], [39.4, 7016.0], [39.5, 7021.0], [39.6, 7035.0], [39.7, 7049.0], [39.8, 7055.0], [39.9, 7062.0], [40.0, 7079.0], [40.1, 7092.0], [40.2, 7108.0], [40.3, 7116.0], [40.4, 7119.0], [40.5, 7129.0], [40.6, 7144.0], [40.7, 7148.0], [40.8, 7162.0], [40.9, 7172.0], [41.0, 7178.0], [41.1, 7188.0], [41.2, 7202.0], [41.3, 7213.0], [41.4, 7222.0], [41.5, 7226.0], [41.6, 7241.0], [41.7, 7256.0], [41.8, 7280.0], [41.9, 7281.0], [42.0, 7306.0], [42.1, 7324.0], [42.2, 7337.0], [42.3, 7342.0], [42.4, 7345.0], [42.5, 7355.0], [42.6, 7394.0], [42.7, 7402.0], [42.8, 7410.0], [42.9, 7428.0], [43.0, 7432.0], [43.1, 7454.0], [43.2, 7457.0], [43.3, 7460.0], [43.4, 7475.0], [43.5, 7485.0], [43.6, 7499.0], [43.7, 7504.0], [43.8, 7515.0], [43.9, 7522.0], [44.0, 7526.0], [44.1, 7529.0], [44.2, 7549.0], [44.3, 7563.0], [44.4, 7570.0], [44.5, 7578.0], [44.6, 7593.0], [44.7, 7613.0], [44.8, 7622.0], [44.9, 7630.0], [45.0, 7669.0], [45.1, 7675.0], [45.2, 7685.0], [45.3, 7698.0], [45.4, 7702.0], [45.5, 7746.0], [45.6, 7766.0], [45.7, 7785.0], [45.8, 7797.0], [45.9, 7821.0], [46.0, 7836.0], [46.1, 7843.0], [46.2, 7847.0], [46.3, 7862.0], [46.4, 7866.0], [46.5, 7877.0], [46.6, 7882.0], [46.7, 7896.0], [46.8, 7914.0], [46.9, 7942.0], [47.0, 7946.0], [47.1, 7960.0], [47.2, 7961.0], [47.3, 7972.0], [47.4, 7974.0], [47.5, 7985.0], [47.6, 8001.0], [47.7, 8014.0], [47.8, 8019.0], [47.9, 8048.0], [48.0, 8056.0], [48.1, 8096.0], [48.2, 8101.0], [48.3, 8117.0], [48.4, 8118.0], [48.5, 8118.0], [48.6, 8129.0], [48.7, 8133.0], [48.8, 8142.0], [48.9, 8148.0], [49.0, 8161.0], [49.1, 8165.0], [49.2, 8173.0], [49.3, 8180.0], [49.4, 8184.0], [49.5, 8205.0], [49.6, 8211.0], [49.7, 8222.0], [49.8, 8226.0], [49.9, 8232.0], [50.0, 8236.0], [50.1, 8248.0], [50.2, 8250.0], [50.3, 8283.0], [50.4, 8313.0], [50.5, 8331.0], [50.6, 8343.0], [50.7, 8348.0], [50.8, 8364.0], [50.9, 8365.0], [51.0, 8381.0], [51.1, 8397.0], [51.2, 8404.0], [51.3, 8447.0], [51.4, 8460.0], [51.5, 8463.0], [51.6, 8471.0], [51.7, 8489.0], [51.8, 8511.0], [51.9, 8537.0], [52.0, 8554.0], [52.1, 8559.0], [52.2, 8564.0], [52.3, 8566.0], [52.4, 8581.0], [52.5, 8586.0], [52.6, 8594.0], [52.7, 8617.0], [52.8, 8633.0], [52.9, 8643.0], [53.0, 8654.0], [53.1, 8663.0], [53.2, 8673.0], [53.3, 8677.0], [53.4, 8698.0], [53.5, 8709.0], [53.6, 8713.0], [53.7, 8743.0], [53.8, 8746.0], [53.9, 8758.0], [54.0, 8769.0], [54.1, 8788.0], [54.2, 8814.0], [54.3, 8818.0], [54.4, 8824.0], [54.5, 8836.0], [54.6, 8851.0], [54.7, 8886.0], [54.8, 8934.0], [54.9, 8962.0], [55.0, 8983.0], [55.1, 9023.0], [55.2, 9042.0], [55.3, 9065.0], [55.4, 9084.0], [55.5, 9121.0], [55.6, 9137.0], [55.7, 9148.0], [55.8, 9214.0], [55.9, 9245.0], [56.0, 9264.0], [56.1, 9274.0], [56.2, 9298.0], [56.3, 9307.0], [56.4, 9316.0], [56.5, 9322.0], [56.6, 9350.0], [56.7, 9359.0], [56.8, 9368.0], [56.9, 9406.0], [57.0, 9416.0], [57.1, 9430.0], [57.2, 9438.0], [57.3, 9445.0], [57.4, 9455.0], [57.5, 9462.0], [57.6, 9462.0], [57.7, 9466.0], [57.8, 9470.0], [57.9, 9483.0], [58.0, 9485.0], [58.1, 9489.0], [58.2, 9493.0], [58.3, 9501.0], [58.4, 9507.0], [58.5, 9511.0], [58.6, 9520.0], [58.7, 9523.0], [58.8, 9531.0], [58.9, 9532.0], [59.0, 9534.0], [59.1, 9544.0], [59.2, 9568.0], [59.3, 9578.0], [59.4, 9586.0], [59.5, 9595.0], [59.6, 9599.0], [59.7, 9612.0], [59.8, 9619.0], [59.9, 9627.0], [60.0, 9634.0], [60.1, 9644.0], [60.2, 9653.0], [60.3, 9666.0], [60.4, 9668.0], [60.5, 9674.0], [60.6, 9679.0], [60.7, 9699.0], [60.8, 9702.0], [60.9, 9717.0], [61.0, 9735.0], [61.1, 9752.0], [61.2, 9768.0], [61.3, 9780.0], [61.4, 9791.0], [61.5, 9797.0], [61.6, 9804.0], [61.7, 9811.0], [61.8, 9825.0], [61.9, 9878.0], [62.0, 9886.0], [62.1, 9895.0], [62.2, 9900.0], [62.3, 9923.0], [62.4, 9932.0], [62.5, 9944.0], [62.6, 9948.0], [62.7, 9952.0], [62.8, 9955.0], [62.9, 9960.0], [63.0, 9964.0], [63.1, 9971.0], [63.2, 9980.0], [63.3, 10008.0], [63.4, 10015.0], [63.5, 10029.0], [63.6, 10048.0], [63.7, 10062.0], [63.8, 10085.0], [63.9, 10110.0], [64.0, 10115.0], [64.1, 10120.0], [64.2, 10127.0], [64.3, 10129.0], [64.4, 10131.0], [64.5, 10141.0], [64.6, 10163.0], [64.7, 10167.0], [64.8, 10177.0], [64.9, 10183.0], [65.0, 10194.0], [65.1, 10208.0], [65.2, 10212.0], [65.3, 10221.0], [65.4, 10229.0], [65.5, 10236.0], [65.6, 10251.0], [65.7, 10273.0], [65.8, 10307.0], [65.9, 10321.0], [66.0, 10324.0], [66.1, 10335.0], [66.2, 10365.0], [66.3, 10373.0], [66.4, 10377.0], [66.5, 10380.0], [66.6, 10389.0], [66.7, 10391.0], [66.8, 10402.0], [66.9, 10418.0], [67.0, 10432.0], [67.1, 10436.0], [67.2, 10442.0], [67.3, 10451.0], [67.4, 10461.0], [67.5, 10471.0], [67.6, 10483.0], [67.7, 10488.0], [67.8, 10507.0], [67.9, 10518.0], [68.0, 10536.0], [68.1, 10546.0], [68.2, 10572.0], [68.3, 10579.0], [68.4, 10586.0], [68.5, 10586.0], [68.6, 10621.0], [68.7, 10625.0], [68.8, 10637.0], [68.9, 10643.0], [69.0, 10647.0], [69.1, 10657.0], [69.2, 10660.0], [69.3, 10683.0], [69.4, 10693.0], [69.5, 10696.0], [69.6, 10707.0], [69.7, 10718.0], [69.8, 10722.0], [69.9, 10728.0], [70.0, 10736.0], [70.1, 10741.0], [70.2, 10747.0], [70.3, 10764.0], [70.4, 10777.0], [70.5, 10786.0], [70.6, 10795.0], [70.7, 10815.0], [70.8, 10821.0], [70.9, 10827.0], [71.0, 10840.0], [71.1, 10842.0], [71.2, 10845.0], [71.3, 10851.0], [71.4, 10855.0], [71.5, 10862.0], [71.6, 10872.0], [71.7, 10882.0], [71.8, 10896.0], [71.9, 10900.0], [72.0, 10902.0], [72.1, 10918.0], [72.2, 10935.0], [72.3, 10959.0], [72.4, 10968.0], [72.5, 10981.0], [72.6, 10987.0], [72.7, 10992.0], [72.8, 11018.0], [72.9, 11033.0], [73.0, 11040.0], [73.1, 11046.0], [73.2, 11054.0], [73.3, 11059.0], [73.4, 11061.0], [73.5, 11097.0], [73.6, 11124.0], [73.7, 11128.0], [73.8, 11142.0], [73.9, 11161.0], [74.0, 11171.0], [74.1, 11182.0], [74.2, 11193.0], [74.3, 11204.0], [74.4, 11214.0], [74.5, 11217.0], [74.6, 11226.0], [74.7, 11237.0], [74.8, 11249.0], [74.9, 11265.0], [75.0, 11295.0], [75.1, 11305.0], [75.2, 11318.0], [75.3, 11332.0], [75.4, 11342.0], [75.5, 11356.0], [75.6, 11364.0], [75.7, 11373.0], [75.8, 11374.0], [75.9, 11380.0], [76.0, 11384.0], [76.1, 11395.0], [76.2, 11432.0], [76.3, 11436.0], [76.4, 11455.0], [76.5, 11457.0], [76.6, 11466.0], [76.7, 11473.0], [76.8, 11481.0], [76.9, 11502.0], [77.0, 11510.0], [77.1, 11511.0], [77.2, 11515.0], [77.3, 11519.0], [77.4, 11521.0], [77.5, 11538.0], [77.6, 11546.0], [77.7, 11562.0], [77.8, 11573.0], [77.9, 11579.0], [78.0, 11585.0], [78.1, 11591.0], [78.2, 11593.0], [78.3, 11603.0], [78.4, 11606.0], [78.5, 11614.0], [78.6, 11619.0], [78.7, 11638.0], [78.8, 11641.0], [78.9, 11644.0], [79.0, 11648.0], [79.1, 11657.0], [79.2, 11661.0], [79.3, 11670.0], [79.4, 11687.0], [79.5, 11699.0], [79.6, 11704.0], [79.7, 11713.0], [79.8, 11717.0], [79.9, 11722.0], [80.0, 11724.0], [80.1, 11731.0], [80.2, 11738.0], [80.3, 11743.0], [80.4, 11749.0], [80.5, 11760.0], [80.6, 11764.0], [80.7, 11770.0], [80.8, 11773.0], [80.9, 11812.0], [81.0, 11823.0], [81.1, 11845.0], [81.2, 11866.0], [81.3, 11873.0], [81.4, 11877.0], [81.5, 11885.0], [81.6, 11892.0], [81.7, 11902.0], [81.8, 11925.0], [81.9, 11938.0], [82.0, 11941.0], [82.1, 11964.0], [82.2, 11972.0], [82.3, 11974.0], [82.4, 11986.0], [82.5, 11992.0], [82.6, 11993.0], [82.7, 11998.0], [82.8, 11999.0], [82.9, 12021.0], [83.0, 12023.0], [83.1, 12028.0], [83.2, 12036.0], [83.3, 12039.0], [83.4, 12043.0], [83.5, 12051.0], [83.6, 12054.0], [83.7, 12072.0], [83.8, 12077.0], [83.9, 12092.0], [84.0, 12098.0], [84.1, 12108.0], [84.2, 12116.0], [84.3, 12125.0], [84.4, 12126.0], [84.5, 12128.0], [84.6, 12129.0], [84.7, 12133.0], [84.8, 12136.0], [84.9, 12145.0], [85.0, 12163.0], [85.1, 12170.0], [85.2, 12179.0], [85.3, 12184.0], [85.4, 12192.0], [85.5, 12196.0], [85.6, 12205.0], [85.7, 12209.0], [85.8, 12219.0], [85.9, 12220.0], [86.0, 12224.0], [86.1, 12226.0], [86.2, 12230.0], [86.3, 12240.0], [86.4, 12247.0], [86.5, 12249.0], [86.6, 12262.0], [86.7, 12265.0], [86.8, 12270.0], [86.9, 12272.0], [87.0, 12273.0], [87.1, 12279.0], [87.2, 12283.0], [87.3, 12287.0], [87.4, 12305.0], [87.5, 12308.0], [87.6, 12309.0], [87.7, 12319.0], [87.8, 12325.0], [87.9, 12336.0], [88.0, 12338.0], [88.1, 12344.0], [88.2, 12350.0], [88.3, 12353.0], [88.4, 12359.0], [88.5, 12364.0], [88.6, 12371.0], [88.7, 12391.0], [88.8, 12398.0], [88.9, 12414.0], [89.0, 12427.0], [89.1, 12441.0], [89.2, 12448.0], [89.3, 12458.0], [89.4, 12465.0], [89.5, 12473.0], [89.6, 12488.0], [89.7, 12492.0], [89.8, 12501.0], [89.9, 12534.0], [90.0, 12540.0], [90.1, 12542.0], [90.2, 12553.0], [90.3, 12559.0], [90.4, 12571.0], [90.5, 12574.0], [90.6, 12604.0], [90.7, 12607.0], [90.8, 12610.0], [90.9, 12618.0], [91.0, 12619.0], [91.1, 12626.0], [91.2, 12632.0], [91.3, 12644.0], [91.4, 12659.0], [91.5, 12665.0], [91.6, 12672.0], [91.7, 12678.0], [91.8, 12685.0], [91.9, 12699.0], [92.0, 12704.0], [92.1, 12734.0], [92.2, 12750.0], [92.3, 12754.0], [92.4, 12762.0], [92.5, 12786.0], [92.6, 12790.0], [92.7, 12801.0], [92.8, 12814.0], [92.9, 12820.0], [93.0, 12828.0], [93.1, 12832.0], [93.2, 12837.0], [93.3, 12851.0], [93.4, 12862.0], [93.5, 12868.0], [93.6, 12875.0], [93.7, 12883.0], [93.8, 12899.0], [93.9, 12926.0], [94.0, 12938.0], [94.1, 12946.0], [94.2, 12951.0], [94.3, 12965.0], [94.4, 12976.0], [94.5, 12982.0], [94.6, 13011.0], [94.7, 13016.0], [94.8, 13020.0], [94.9, 13038.0], [95.0, 13070.0], [95.1, 13088.0], [95.2, 13094.0], [95.3, 13110.0], [95.4, 13114.0], [95.5, 13123.0], [95.6, 13131.0], [95.7, 13141.0], [95.8, 13169.0], [95.9, 13176.0], [96.0, 13188.0], [96.1, 13218.0], [96.2, 13222.0], [96.3, 13229.0], [96.4, 13251.0], [96.5, 13254.0], [96.6, 13270.0], [96.7, 13280.0], [96.8, 13286.0], [96.9, 13297.0], [97.0, 13311.0], [97.1, 13330.0], [97.2, 13341.0], [97.3, 13356.0], [97.4, 13360.0], [97.5, 13365.0], [97.6, 13379.0], [97.7, 13386.0], [97.8, 13416.0], [97.9, 13436.0], [98.0, 13449.0], [98.1, 13472.0], [98.2, 13500.0], [98.3, 13522.0], [98.4, 13546.0], [98.5, 13559.0], [98.6, 13580.0], [98.7, 13639.0], [98.8, 13672.0], [98.9, 13705.0], [99.0, 13711.0], [99.1, 13739.0], [99.2, 13755.0], [99.3, 13761.0], [99.4, 13873.0], [99.5, 13926.0], [99.6, 13980.0], [99.7, 14139.0], [99.8, 14160.0], [99.9, 14349.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 37.0, "series": [{"data": [[300.0, 5.0], [400.0, 15.0], [500.0, 15.0], [600.0, 6.0], [700.0, 6.0], [800.0, 4.0], [900.0, 2.0], [1000.0, 11.0], [1100.0, 5.0], [1200.0, 8.0], [1300.0, 7.0], [1400.0, 3.0], [1500.0, 6.0], [1600.0, 5.0], [1700.0, 7.0], [1800.0, 5.0], [1900.0, 4.0], [2000.0, 7.0], [2100.0, 2.0], [2200.0, 3.0], [2300.0, 8.0], [2400.0, 4.0], [2500.0, 6.0], [2600.0, 9.0], [2700.0, 1.0], [2800.0, 2.0], [2900.0, 3.0], [3000.0, 3.0], [3100.0, 8.0], [3300.0, 8.0], [3200.0, 9.0], [3400.0, 16.0], [3500.0, 24.0], [3700.0, 20.0], [3600.0, 17.0], [3800.0, 18.0], [3900.0, 19.0], [4000.0, 12.0], [4200.0, 19.0], [4300.0, 13.0], [4100.0, 15.0], [4600.0, 15.0], [4500.0, 18.0], [4400.0, 21.0], [4700.0, 25.0], [4800.0, 15.0], [5000.0, 21.0], [5100.0, 17.0], [4900.0, 15.0], [5200.0, 12.0], [5300.0, 11.0], [5500.0, 15.0], [5400.0, 25.0], [5600.0, 17.0], [5800.0, 12.0], [5700.0, 12.0], [5900.0, 17.0], [6000.0, 8.0], [6100.0, 18.0], [6300.0, 8.0], [6200.0, 13.0], [6500.0, 19.0], [6600.0, 19.0], [6400.0, 14.0], [6700.0, 21.0], [6900.0, 15.0], [6800.0, 21.0], [7100.0, 21.0], [7000.0, 19.0], [7200.0, 16.0], [7300.0, 14.0], [7400.0, 19.0], [7500.0, 20.0], [7600.0, 15.0], [7800.0, 18.0], [7900.0, 17.0], [7700.0, 9.0], [8000.0, 11.0], [8100.0, 26.0], [8700.0, 14.0], [8200.0, 19.0], [8500.0, 18.0], [8600.0, 16.0], [8300.0, 16.0], [8400.0, 11.0], [8800.0, 12.0], [8900.0, 6.0], [9100.0, 6.0], [9200.0, 9.0], [9000.0, 9.0], [9500.0, 27.0], [9400.0, 28.0], [9300.0, 13.0], [9700.0, 16.0], [9600.0, 22.0], [9800.0, 13.0], [9900.0, 21.0], [10100.0, 23.0], [10200.0, 14.0], [10000.0, 13.0], [10700.0, 23.0], [10600.0, 20.0], [10400.0, 19.0], [10300.0, 21.0], [10500.0, 16.0], [10900.0, 18.0], [10800.0, 24.0], [11000.0, 15.0], [11100.0, 14.0], [11200.0, 16.0], [11500.0, 27.0], [11600.0, 26.0], [11400.0, 15.0], [11300.0, 22.0], [11700.0, 27.0], [11900.0, 23.0], [11800.0, 16.0], [12200.0, 37.0], [12100.0, 30.0], [12000.0, 24.0], [12300.0, 29.0], [12700.0, 15.0], [12600.0, 27.0], [12400.0, 18.0], [12500.0, 17.0], [13000.0, 13.0], [13100.0, 16.0], [12800.0, 23.0], [12900.0, 15.0], [13200.0, 18.0], [13300.0, 16.0], [13500.0, 10.0], [13700.0, 9.0], [13400.0, 9.0], [13600.0, 4.0], [13800.0, 3.0], [13900.0, 3.0], [14100.0, 5.0], [14300.0, 1.0], [14700.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 14700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 21.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1913.0, "series": [{"data": [[1.0, 66.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 21.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1913.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 102.12244897959182, "minX": 1.5496077E12, "maxY": 764.8795489492561, "series": [{"data": [[1.54960776E12, 764.8795489492561], [1.5496077E12, 102.12244897959182]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 788.0, "minX": 1.0, "maxY": 14183.0, "series": [{"data": [[2.0, 13110.0], [3.0, 13070.0], [4.0, 12828.0], [5.0, 13188.0], [6.0, 12880.0], [7.0, 12934.0], [9.0, 12904.0], [10.0, 13141.0], [11.0, 13088.0], [12.0, 12982.0], [13.0, 12883.0], [15.0, 13312.5], [16.0, 13026.0], [17.0, 12862.0], [18.0, 12938.0], [19.0, 12949.0], [20.0, 13229.0], [21.0, 13094.0], [22.0, 13580.0], [23.0, 13016.0], [24.0, 12849.0], [26.0, 12970.0], [27.0, 12868.0], [28.0, 12806.0], [29.0, 13386.0], [30.0, 13045.0], [31.0, 13176.0], [33.0, 14139.0], [32.0, 13225.0], [35.0, 13306.0], [37.0, 13380.0], [36.0, 12959.0], [39.0, 12969.0], [41.0, 13331.5], [43.0, 12750.0], [42.0, 12866.0], [45.0, 13251.0], [44.0, 13761.0], [47.0, 13115.0], [46.0, 13218.0], [49.0, 12859.0], [48.0, 13639.0], [51.0, 13598.0], [50.0, 13641.0], [52.0, 13739.0], [55.0, 12871.0], [54.0, 13244.5], [57.0, 12746.0], [56.0, 13810.0], [59.0, 13270.0], [58.0, 13493.0], [61.0, 13123.0], [60.0, 13711.0], [63.0, 13092.0], [62.0, 13559.0], [67.0, 13365.0], [66.0, 13153.0], [65.0, 13896.0], [64.0, 13287.0], [71.0, 12661.0], [70.0, 12672.0], [69.0, 13759.0], [68.0, 14183.0], [72.0, 7357.0], [73.0, 6740.5], [75.0, 12687.0], [74.0, 12951.0], [77.0, 2240.714285714286], [78.0, 5004.0], [79.0, 6768.0], [76.0, 13416.0], [80.0, 6956.5], [83.0, 3044.0], [82.0, 9065.0], [84.0, 3080.8], [86.0, 7333.0], [85.0, 7213.5], [87.0, 13436.0], [89.0, 4810.333333333333], [88.0, 6886.0], [91.0, 13550.0], [90.0, 13362.0], [92.0, 4797.333333333333], [94.0, 13215.0], [93.0, 13672.0], [99.0, 5242.0], [98.0, 5136.333333333333], [97.0, 13560.0], [96.0, 13817.0], [103.0, 6992.0], [102.0, 13422.0], [101.0, 13278.0], [100.0, 13546.0], [107.0, 4890.333333333333], [106.0, 13980.0], [105.0, 13944.0], [104.0, 13254.0], [111.0, 13360.0], [110.0, 13011.0], [109.0, 13449.0], [108.0, 13101.0], [114.0, 6347.5], [113.0, 13723.0], [112.0, 13170.0], [117.0, 788.0], [119.0, 11992.0], [118.0, 12184.0], [116.0, 12001.5], [123.0, 12652.5], [121.0, 12121.0], [120.0, 12272.0], [125.0, 6501.0], [127.0, 12414.0], [126.0, 12126.0], [124.0, 12607.0], [131.0, 6746.5], [130.0, 6370.0], [135.0, 6489.5], [134.0, 12179.0], [133.0, 12170.0], [132.0, 12202.0], [129.0, 11992.0], [128.0, 12248.0], [136.0, 6370.0], [143.0, 12196.0], [142.0, 12272.0], [141.0, 12072.0], [140.0, 11989.0], [139.0, 11938.0], [138.0, 12080.0], [137.0, 12051.0], [148.0, 6633.5], [150.0, 12444.0], [149.0, 12021.0], [147.0, 12283.0], [146.0, 12270.0], [145.0, 12108.0], [144.0, 12021.0], [158.0, 4685.0], [159.0, 6435.5], [157.0, 12553.0], [156.0, 12224.0], [155.0, 12241.0], [154.0, 12209.0], [153.0, 12191.0], [152.0, 12294.5], [160.0, 6576.0], [164.0, 6518.5], [165.0, 6498.0], [167.0, 12583.5], [163.0, 12224.0], [162.0, 12308.0], [161.0, 12568.0], [175.0, 11954.0], [174.0, 12453.0], [173.0, 12374.0], [172.0, 12829.0], [171.0, 13280.0], [170.0, 12609.0], [169.0, 12702.0], [168.0, 12430.0], [181.0, 6498.5], [183.0, 12814.0], [182.0, 12267.0], [180.0, 12371.0], [179.0, 11964.0], [178.0, 12283.0], [177.0, 12427.0], [176.0, 12357.0], [184.0, 6548.5], [191.0, 12685.0], [190.0, 12249.0], [189.0, 12213.0], [188.0, 13705.0], [187.0, 12144.0], [186.0, 12226.0], [185.0, 12458.0], [196.0, 6696.0], [199.0, 6546.5], [198.0, 12790.0], [197.0, 12338.0], [195.0, 12263.0], [194.0, 12704.0], [193.0, 12616.0], [192.0, 12501.0], [203.0, 4694.0], [202.0, 6819.0], [207.0, 12129.0], [206.0, 12473.0], [205.0, 12314.0], [204.0, 12039.0], [201.0, 12038.0], [200.0, 12262.0], [215.0, 12385.5], [213.0, 12359.0], [211.0, 12342.0], [209.0, 12775.0], [208.0, 12559.0], [219.0, 6685.0], [223.0, 12460.0], [222.0, 12981.0], [220.0, 13682.0], [218.0, 13136.0], [217.0, 13311.0], [216.0, 12787.0], [230.0, 6477.0], [231.0, 12571.0], [229.0, 12492.0], [228.0, 11902.0], [227.0, 12107.0], [226.0, 12752.0], [225.0, 13185.0], [224.0, 11972.0], [234.0, 3172.166666666667], [235.0, 4962.666666666666], [239.0, 12699.0], [238.0, 12364.0], [237.0, 13412.0], [236.0, 12646.0], [233.0, 12448.0], [232.0, 12279.0], [241.0, 6944.0], [243.0, 6981.0], [245.0, 6808.0], [247.0, 13505.0], [246.0, 13016.0], [244.0, 12192.0], [242.0, 12305.0], [240.0, 11866.0], [248.0, 6613.0], [252.0, 6753.5], [255.0, 12610.0], [254.0, 12220.0], [253.0, 12542.0], [251.0, 12128.0], [250.0, 11709.0], [249.0, 12247.0], [269.0, 12899.0], [262.0, 6773.5], [261.0, 7485.5], [260.0, 13124.0], [265.0, 4930.666666666666], [270.0, 7090.5], [271.0, 13169.0], [268.0, 13297.0], [263.0, 12230.0], [258.0, 12501.0], [257.0, 12442.5], [259.0, 13131.0], [267.0, 12652.5], [264.0, 13019.0], [273.0, 4977.333333333334], [276.0, 6863.5], [277.0, 6878.0], [278.0, 5244.0], [272.0, 12820.0], [287.0, 12666.0], [281.0, 13251.0], [280.0, 13083.0], [286.0, 12604.0], [285.0, 12557.0], [284.0, 12619.0], [275.0, 13220.0], [274.0, 12593.0], [283.0, 12287.0], [282.0, 12391.0], [303.0, 7187.0], [298.0, 7196.0], [302.0, 12351.0], [301.0, 11526.0], [300.0, 11481.0], [291.0, 12353.0], [290.0, 12265.0], [289.0, 12926.0], [288.0, 12349.0], [299.0, 12323.0], [297.0, 12571.0], [296.0, 12678.0], [295.0, 12821.0], [294.0, 12527.0], [293.0, 12360.0], [292.0, 12795.0], [319.0, 11845.0], [306.0, 6507.0], [311.0, 12036.0], [305.0, 12659.0], [304.0, 12116.0], [310.0, 11749.0], [309.0, 12013.0], [308.0, 12534.0], [315.0, 6817.0], [318.0, 11733.0], [317.0, 12801.0], [316.0, 12136.0], [307.0, 11657.0], [314.0, 11792.0], [313.0, 11573.0], [312.0, 11731.0], [333.0, 11851.0], [327.0, 4854.333333333334], [325.0, 6563.0], [324.0, 12226.0], [326.0, 11033.0], [329.0, 7174.5], [335.0, 12815.0], [334.0, 11509.0], [332.0, 11764.0], [323.0, 12133.0], [322.0, 11661.0], [321.0, 11877.0], [320.0, 11915.0], [331.0, 12016.0], [328.0, 12628.0], [350.0, 11645.0], [337.0, 6687.0], [338.0, 6730.0], [339.0, 11639.0], [342.0, 6883.0], [343.0, 11743.0], [336.0, 11998.0], [341.0, 7238.5], [340.0, 12359.0], [351.0, 11999.0], [345.0, 11364.0], [344.0, 11713.0], [349.0, 12170.0], [348.0, 11722.0], [347.0, 11812.0], [346.0, 12225.0], [366.0, 12098.0], [360.0, 6879.0], [363.0, 5214.333333333334], [364.0, 6628.5], [367.0, 11825.0], [365.0, 11591.0], [362.0, 11967.0], [361.0, 13114.0], [359.0, 11704.0], [353.0, 12134.0], [352.0, 12364.0], [355.0, 11510.0], [354.0, 12072.0], [358.0, 11579.0], [357.0, 11670.0], [356.0, 11998.0], [383.0, 6793.5], [377.0, 6576.0], [382.0, 11738.0], [381.0, 12415.0], [380.0, 11521.0], [371.0, 12219.0], [370.0, 11686.0], [369.0, 12441.0], [368.0, 11395.0], [379.0, 12125.0], [378.0, 11357.0], [376.0, 13020.0], [375.0, 11601.0], [374.0, 11713.0], [373.0, 11613.0], [372.0, 12281.0], [399.0, 6653.0], [391.0, 6956.5], [390.0, 11444.0], [389.0, 11822.0], [388.0, 11496.0], [394.0, 4738.666666666666], [398.0, 7038.0], [397.0, 11619.0], [396.0, 12707.0], [387.0, 11466.0], [386.0, 11699.0], [385.0, 12350.0], [384.0, 12273.0], [395.0, 11760.0], [393.0, 11729.0], [392.0, 11993.0], [415.0, 11579.5], [403.0, 7001.0], [402.0, 12240.0], [401.0, 11603.0], [400.0, 11204.0], [411.0, 6884.0], [413.0, 12308.0], [412.0, 11473.0], [410.0, 11182.0], [409.0, 11724.0], [408.0, 11616.0], [407.0, 12170.0], [406.0, 11320.0], [405.0, 12492.0], [404.0, 11140.0], [430.0, 6912.0], [420.0, 7038.0], [422.0, 11214.0], [421.0, 11124.0], [425.0, 5121.666666666666], [424.0, 6675.5], [423.0, 6573.5], [431.0, 11591.0], [429.0, 11687.0], [428.0, 11976.0], [419.0, 11703.0], [418.0, 11873.0], [417.0, 11933.0], [416.0, 12052.0], [427.0, 11722.0], [426.0, 11177.0], [446.0, 12618.0], [437.0, 5719.333333333334], [438.0, 7359.5], [439.0, 11519.0], [435.0, 12132.0], [434.0, 11605.0], [433.0, 11562.0], [432.0, 12028.0], [436.0, 6550.5], [447.0, 11941.0], [441.0, 11717.0], [440.0, 11356.0], [445.0, 11455.0], [444.0, 12109.0], [443.0, 12618.0], [442.0, 11432.0], [461.0, 6842.5], [449.0, 6800.5], [450.0, 6599.0], [454.0, 7405.5], [453.0, 11717.0], [452.0, 11823.0], [455.0, 6560.5], [448.0, 11374.0], [463.0, 12184.0], [462.0, 11171.0], [460.0, 10725.0], [451.0, 11767.0], [459.0, 11745.0], [458.0, 10840.0], [457.0, 12045.0], [456.0, 11295.0], [478.0, 12205.0], [471.0, 6700.5], [465.0, 11287.0], [464.0, 11648.0], [467.0, 10897.0], [466.0, 11974.0], [470.0, 11128.0], [469.0, 11379.0], [468.0, 11877.0], [479.0, 11589.0], [477.0, 11305.0], [476.0, 11126.0], [475.0, 10918.0], [474.0, 12398.0], [473.0, 11060.0], [472.0, 10855.0], [494.0, 6731.0], [492.0, 6603.5], [495.0, 10635.0], [493.0, 10845.0], [491.0, 10862.5], [489.0, 11249.0], [488.0, 11999.0], [487.0, 11382.0], [481.0, 10860.0], [480.0, 10554.0], [483.0, 11666.0], [482.0, 11641.0], [486.0, 11201.0], [485.0, 11557.0], [484.0, 11892.0], [510.0, 11614.0], [499.0, 6478.5], [498.0, 10586.0], [497.0, 10518.0], [496.0, 10840.0], [503.0, 11356.0], [502.0, 11771.0], [501.0, 10542.0], [500.0, 11380.0], [511.0, 10900.0], [509.0, 11751.0], [508.0, 10580.0], [507.0, 10959.0], [506.0, 11055.0], [505.0, 11224.0], [504.0, 11255.0], [541.0, 11054.0], [513.0, 7006.5], [523.0, 6938.5], [522.0, 6486.5], [521.0, 10377.0], [520.0, 11111.0], [527.0, 5246.333333333334], [512.0, 11636.0], [526.0, 11166.0], [525.0, 11638.0], [524.0, 11570.0], [535.0, 6977.0], [534.0, 11342.0], [533.0, 11641.0], [532.0, 10623.0], [531.0, 10935.0], [530.0, 10722.0], [529.0, 11059.0], [528.0, 11546.0], [543.0, 11510.0], [542.0, 10315.0], [540.0, 10572.0], [539.0, 10881.0], [538.0, 11237.0], [537.0, 10765.0], [536.0, 11365.0], [519.0, 10643.0], [518.0, 11033.0], [517.0, 10704.0], [516.0, 11213.0], [515.0, 11061.0], [514.0, 11738.0], [549.0, 5068.0], [571.0, 6827.5], [551.0, 6997.0], [550.0, 11217.0], [568.0, 10753.0], [570.0, 11142.0], [569.0, 11036.0], [554.0, 2515.0], [553.0, 11373.0], [552.0, 11265.0], [556.0, 10996.0], [555.0, 10906.5], [557.0, 5332.333333333334], [559.0, 10114.0], [548.0, 11018.0], [547.0, 10036.0], [546.0, 11247.0], [545.0, 10851.0], [544.0, 11042.0], [558.0, 10882.0], [562.0, 5030.333333333334], [564.0, 11301.0], [563.0, 10817.0], [561.0, 6806.5], [565.0, 6751.5], [567.0, 6831.5], [566.0, 10795.0], [572.0, 5448.333333333334], [573.0, 11512.0], [575.0, 10324.0], [560.0, 11047.0], [574.0, 10862.0], [600.0, 10920.0], [604.0, 6700.0], [592.0, 6572.0], [598.0, 5123.0], [597.0, 10579.0], [596.0, 10321.0], [595.0, 11446.5], [593.0, 10987.0], [599.0, 10696.0], [602.0, 6912.5], [605.0, 6780.0], [607.0, 9948.0], [606.0, 10687.0], [603.0, 10251.0], [601.0, 11511.0], [591.0, 10335.0], [576.0, 10744.0], [578.0, 11585.0], [577.0, 10420.0], [580.0, 10442.0], [579.0, 10451.0], [583.0, 10777.0], [582.0, 11052.5], [590.0, 10389.0], [589.0, 10359.5], [587.0, 8395.0], [586.0, 10013.0], [585.0, 10718.0], [584.0, 11462.0], [636.0, 6461.0], [617.0, 7061.5], [616.0, 10391.0], [618.0, 10380.0], [621.0, 10815.0], [620.0, 10210.0], [623.0, 10008.0], [608.0, 10432.0], [610.0, 10500.0], [609.0, 10728.0], [612.0, 10657.0], [611.0, 10377.0], [615.0, 10835.0], [614.0, 10237.0], [622.0, 9438.0], [624.0, 6765.0], [625.0, 10062.0], [627.0, 10915.0], [626.0, 10710.0], [629.0, 10786.0], [628.0, 11237.0], [631.0, 11191.0], [630.0, 10741.0], [632.0, 6118.0], [635.0, 6756.0], [639.0, 6699.5], [638.0, 10900.0], [637.0, 10827.0], [634.0, 11097.0], [633.0, 10637.0], [668.0, 10306.0], [648.0, 6723.0], [649.0, 10167.0], [651.0, 10462.0], [650.0, 10507.0], [653.0, 9699.0], [652.0, 10418.0], [655.0, 10546.0], [641.0, 10868.0], [643.0, 9668.0], [642.0, 10484.0], [645.0, 10896.0], [644.0, 10981.0], [647.0, 10764.0], [646.0, 10648.0], [654.0, 10660.0], [671.0, 10130.0], [657.0, 10379.0], [656.0, 10777.0], [659.0, 10238.0], [658.0, 10471.0], [661.0, 10085.0], [660.0, 10110.0], [663.0, 10827.0], [662.0, 10436.0], [670.0, 10795.0], [669.0, 9905.0], [667.0, 9812.0], [666.0, 10234.0], [665.0, 10141.0], [664.0, 10212.0], [700.0, 10324.0], [703.0, 9943.0], [689.0, 9538.0], [688.0, 9811.0], [691.0, 10647.0], [690.0, 9881.0], [693.0, 10621.0], [692.0, 10477.0], [702.0, 10369.0], [701.0, 10432.0], [699.0, 9132.0], [698.0, 10536.0], [697.0, 10208.0], [696.0, 10203.0], [687.0, 10325.0], [673.0, 9886.0], [672.0, 10062.0], [675.0, 9702.0], [674.0, 9423.0], [677.0, 10736.0], [676.0, 10740.0], [679.0, 9460.0], [678.0, 10488.0], [686.0, 10387.0], [685.0, 10442.0], [684.0, 9970.0], [683.0, 10215.0], [682.0, 10345.5], [680.0, 10358.0], [695.0, 9298.0], [694.0, 10586.0], [732.0, 9666.0], [735.0, 9898.0], [721.0, 9462.0], [720.0, 10373.0], [723.0, 9406.0], [722.0, 10132.0], [725.0, 11474.0], [724.0, 9647.0], [734.0, 10094.0], [733.0, 10221.0], [731.0, 10005.0], [730.0, 9964.0], [729.0, 9791.0], [728.0, 9980.0], [719.0, 10253.0], [705.0, 10531.0], [704.0, 10307.0], [707.0, 10273.0], [706.0, 10129.0], [709.0, 10180.0], [708.0, 9944.0], [711.0, 10183.0], [710.0, 9532.0], [718.0, 10365.0], [717.0, 10194.0], [716.0, 10872.0], [715.0, 10402.0], [714.0, 10395.0], [713.0, 10076.0], [712.0, 10120.0], [727.0, 10172.0], [726.0, 10229.0], [761.0, 9369.0], [766.0, 9944.0], [767.0, 9703.0], [752.0, 9141.0], [754.0, 9627.0], [753.0, 10048.0], [757.0, 10022.0], [756.0, 9606.0], [765.0, 9975.0], [764.0, 11517.0], [763.0, 10206.5], [760.0, 9599.0], [743.0, 9895.0], [742.0, 9434.0], [741.0, 10192.0], [740.0, 10163.0], [739.0, 10165.0], [738.0, 8843.0], [737.0, 10209.0], [736.0, 9752.0], [751.0, 9467.0], [750.0, 10115.0], [749.0, 9932.0], [748.0, 9665.0], [747.0, 10029.0], [746.0, 11538.0], [745.0, 11606.0], [744.0, 10127.0], [759.0, 9722.0], [758.0, 9825.0], [794.0, 5522.333333333333], [799.0, 5544.666666666667], [789.0, 6464.0], [788.0, 5519.666666666666], [787.0, 10882.0], [786.0, 9699.0], [785.0, 9751.0], [784.0, 9757.0], [791.0, 6686.0], [790.0, 9620.0], [793.0, 5011.75], [792.0, 6187.5], [783.0, 9797.0], [769.0, 9367.0], [768.0, 9593.0], [771.0, 9923.0], [770.0, 9952.0], [773.0, 9679.0], [772.0, 9926.0], [775.0, 9849.0], [774.0, 9735.0], [782.0, 9789.0], [781.0, 9804.0], [780.0, 9795.0], [779.0, 9532.0], [778.0, 9302.0], [777.0, 9701.0], [776.0, 9619.0], [798.0, 5554.0], [797.0, 6583.0], [796.0, 5447.333333333333], [795.0, 9678.0], [824.0, 9511.0], [801.0, 5212.75], [800.0, 4487.0], [815.0, 10693.0], [814.0, 9507.0], [813.0, 10967.0], [812.0, 9960.0], [811.0, 10850.0], [804.0, 6506.5], [803.0, 9595.0], [802.0, 9487.0], [805.0, 9520.0], [807.0, 10696.0], [806.0, 9532.0], [825.0, 9322.0], [826.0, 7067.0], [827.0, 7022.5], [829.0, 9514.0], [828.0, 9466.0], [831.0, 9489.0], [817.0, 9492.0], [816.0, 9416.0], [830.0, 9501.0], [808.0, 6556.0], [810.0, 6320.0], [809.0, 6344.5], [818.0, 6925.5], [819.0, 6360.5], [820.0, 10986.0], [821.0, 6514.5], [823.0, 6532.5], [822.0, 9485.0], [858.0, 8698.0], [862.0, 9900.0], [832.0, 5746.333333333333], [833.0, 5499.333333333333], [835.0, 9470.0], [834.0, 10747.0], [837.0, 10968.0], [836.0, 9502.0], [839.0, 9496.0], [838.0, 9455.0], [857.0, 8399.0], [856.0, 9328.0], [859.0, 10177.0], [846.0, 5653.333333333333], [845.0, 10173.5], [843.0, 9463.0], [842.0, 9409.0], [841.0, 10707.0], [840.0, 9448.0], [847.0, 9949.0], [851.0, 6322.0], [852.0, 6885.5], [853.0, 8788.0], [855.0, 6094.5], [854.0, 8746.0], [863.0, 4653.5], [848.0, 8617.0], [850.0, 8819.0], [849.0, 9955.0], [861.0, 8673.0], [860.0, 9954.0], [871.0, 6053.0], [866.0, 4792.25], [864.0, 5753.0], [865.0, 8637.0], [879.0, 9777.0], [877.0, 6029.0], [876.0, 8540.0], [875.0, 8564.0], [878.0, 5245.0], [867.0, 6017.5], [868.0, 9438.0], [869.0, 6784.0], [870.0, 5483.0], [881.0, 6164.0], [885.0, 5947.0], [884.0, 8962.0], [883.0, 9606.0], [882.0, 9810.0], [887.0, 8331.0], [886.0, 9618.0], [880.0, 4923.5], [888.0, 3390.0], [890.0, 9529.0], [889.0, 8249.5], [892.0, 9462.0], [891.0, 8758.0], [894.0, 7843.0], [893.0, 8118.0], [895.0, 6959.5], [874.0, 5421.666666666667], [873.0, 6825.5], [872.0, 6648.0], [923.0, 6953.0], [896.0, 5848.666666666667], [902.0, 5294.0], [903.0, 6637.0], [920.0, 9534.0], [922.0, 9267.0], [921.0, 8010.0], [924.0, 5931.0], [925.0, 4724.0], [926.0, 6444.0], [927.0, 4290.0], [913.0, 8117.0], [912.0, 9042.0], [915.0, 6277.5], [917.0, 8559.0], [916.0, 9445.0], [919.0, 6726.0], [918.0, 9780.0], [914.0, 6606.5], [901.0, 6757.5], [900.0, 8221.0], [899.0, 8222.0], [898.0, 8657.0], [897.0, 8205.0], [907.0, 5481.0], [909.0, 8031.0], [908.0, 8920.0], [906.0, 4718.25], [905.0, 4957.75], [904.0, 9653.0], [910.0, 5081.25], [911.0, 6441.0], [954.0, 4754.5], [928.0, 5979.0], [943.0, 5842.5], [942.0, 6057.5], [941.0, 9121.0], [940.0, 8404.0], [939.0, 8313.0], [938.0, 7866.0], [937.0, 8506.0], [936.0, 8313.0], [953.0, 5527.333333333333], [952.0, 8730.0], [934.0, 8554.0], [933.0, 9316.0], [932.0, 7974.0], [931.0, 9229.0], [930.0, 8566.0], [929.0, 9317.0], [959.0, 6633.5], [944.0, 9024.0], [947.0, 9274.0], [946.0, 7841.5], [949.0, 9084.0], [948.0, 8294.0], [951.0, 9484.0], [950.0, 8236.0], [958.0, 8511.0], [957.0, 7688.0], [956.0, 8886.0], [955.0, 8146.0], [964.0, 6342.0], [961.0, 6978.5], [960.0, 9137.0], [963.0, 8173.0], [962.0, 8471.0], [975.0, 8977.0], [974.0, 7466.0], [973.0, 8381.0], [966.0, 5342.5], [965.0, 8859.0], [967.0, 9014.0], [984.0, 5429.0], [986.0, 5415.25], [988.0, 5671.666666666667], [987.0, 9050.0], [989.0, 6696.0], [990.0, 5275.2], [991.0, 6103.5], [977.0, 8119.0], [976.0, 8710.0], [985.0, 6126.0], [969.0, 5556.5], [968.0, 8133.0], [970.0, 4983.0], [971.0, 6402.0], [972.0, 7225.5], [980.0, 6019.5], [981.0, 8764.0], [982.0, 5325.75], [983.0, 5951.0], [979.0, 6166.25], [999.0, 6124.5], [994.0, 6089.5], [992.0, 6923.5], [993.0, 9544.0], [1007.0, 8175.0], [998.0, 6351.5], [997.0, 8052.0], [996.0, 8633.0], [995.0, 8675.0], [1003.0, 5778.666666666667], [1002.0, 8559.0], [1001.0, 6189.0], [1000.0, 8463.0], [1005.0, 8586.0], [1004.0, 8117.0], [1006.0, 6402.0], [1008.0, 5230.0], [1009.0, 8161.0], [1023.0, 7624.0], [1022.0, 8769.0], [1021.0, 7675.0], [1016.0, 5354.666666666667], [1017.0, 7622.0], [1019.0, 5990.333333333333], [1018.0, 8835.0], [1020.0, 6469.5], [1010.0, 5201.333333333333], [1011.0, 5870.666666666667], [1013.0, 6486.0], [1015.0, 5754.333333333333], [1014.0, 5937.0], [1012.0, 6249.0], [1028.0, 8713.0], [1036.0, 6070.333333333333], [1024.0, 6602.0], [1054.0, 5549.5], [1052.0, 6576.5], [1050.0, 5159.5], [1048.0, 5581.333333333333], [1044.0, 7410.0], [1046.0, 5549.833333333333], [1042.0, 5025.75], [1040.0, 6039.0], [1026.0, 5897.0], [1030.0, 5650.0], [1032.0, 6363.5], [1034.0, 7674.0], [1072.0, 8019.0], [1074.0, 7226.0], [1076.0, 6503.5], [1080.0, 6286.5], [1082.0, 5870.5], [1084.0, 8836.0], [1056.0, 8203.0], [1086.0, 7483.0], [1078.0, 5605.666666666667], [1060.0, 7256.0], [1062.0, 7280.0], [1064.0, 7213.0], [1066.0, 5495.25], [1068.0, 6141.666666666667], [1070.0, 4911.4], [1058.0, 4459.0], [1038.0, 5821.5], [1096.0, 6398.0], [1092.0, 6601.0], [1090.0, 7263.0], [1088.0, 8138.0], [1116.0, 5765.5], [1118.0, 7119.0], [1114.0, 5063.5], [1112.0, 6386.0], [1110.0, 4974.571428571428], [1108.0, 6151.0], [1106.0, 6861.0], [1104.0, 7035.0], [1094.0, 6186.0], [1098.0, 5761.5], [1100.0, 6415.0], [1102.0, 5580.0], [1130.0, 5113.5], [1132.0, 6827.0], [1134.0, 6098.333333333333], [1128.0, 6252.5], [1126.0, 5925.0], [1124.0, 7116.0], [1122.0, 6863.0], [1120.0, 8397.0], [1150.0, 5675.5], [1146.0, 5225.0], [1148.0, 8233.0], [1142.0, 6051.666666666667], [1140.0, 6732.0], [1144.0, 6268.333333333333], [1136.0, 5478.5], [1138.0, 7914.0], [1158.0, 6501.0], [1154.0, 6070.0], [1152.0, 6843.0], [1156.0, 6915.0], [1182.0, 6129.0], [1180.0, 5439.333333333333], [1178.0, 6453.0], [1176.0, 7259.0], [1174.0, 6779.0], [1172.0, 7475.0], [1160.0, 6009.6], [1162.0, 5351.5], [1164.0, 6562.333333333333], [1166.0, 5379.0], [1186.0, 6296.0], [1188.0, 8211.0], [1190.0, 7499.0], [1194.0, 6577.0], [1196.0, 7306.0], [1198.0, 7522.0], [1192.0, 6475.0], [1184.0, 5878.666666666667], [1214.0, 6510.5], [1210.0, 7111.0], [1208.0, 7455.0], [1212.0, 6277.0], [1204.0, 6473.0], [1206.0, 6559.75], [1200.0, 6249.0], [1202.0, 6134.5], [1168.0, 5667.333333333333], [1170.0, 5977.0], [1228.0, 6884.0], [1242.0, 5405.0], [1216.0, 7961.0], [1218.0, 7877.0], [1220.0, 6845.0], [1222.0, 6863.0], [1224.0, 6029.0], [1226.0, 6221.0], [1230.0, 7630.0], [1248.0, 5309.666666666667], [1276.0, 5808.0], [1274.0, 7833.0], [1278.0, 7144.0], [1272.0, 6163.5], [1270.0, 6464.0], [1268.0, 5462.0], [1266.0, 6960.0], [1264.0, 6803.0], [1252.0, 5916.5], [1254.0, 7162.0], [1256.0, 7428.0], [1258.0, 5990.5], [1260.0, 6536.0], [1262.0, 6641.0], [1250.0, 6167.0], [1232.0, 6206.0], [1234.0, 6225.0], [1236.0, 6116.0], [1240.0, 6673.0], [1238.0, 7511.0], [1246.0, 6016.5], [1244.0, 7894.0], [1292.0, 6697.5], [1284.0, 6127.0], [1280.0, 5785.0], [1308.0, 7896.0], [1310.0, 6404.5], [1306.0, 6278.5], [1304.0, 7698.0], [1282.0, 6283.0], [1286.0, 6346.0], [1288.0, 5681.0], [1290.0, 6663.0], [1318.0, 5573.2], [1316.0, 6821.0], [1314.0, 6872.0], [1312.0, 6375.0], [1342.0, 7186.0], [1340.0, 6272.0], [1338.0, 6586.0], [1336.0, 6444.0], [1334.0, 6793.5], [1328.0, 5938.0], [1294.0, 6475.0], [1330.0, 6778.0], [1332.0, 5947.6], [1320.0, 5357.5], [1322.0, 5687.666666666667], [1324.0, 6751.5], [1326.0, 6542.0], [1298.0, 7206.0], [1296.0, 5298.0], [1300.0, 6885.0], [1302.0, 6810.5], [1346.0, 6259.0], [1372.0, 5535.333333333333], [1344.0, 5722.4], [1374.0, 5652.5], [1348.0, 6212.5], [1350.0, 6754.0], [1352.0, 6303.5], [1354.0, 5595.0], [1358.0, 5410.0], [1356.0, 6419.0], [1376.0, 6192.0], [1366.0, 6294.5], [1364.0, 5425.0], [1362.0, 5193.0], [1360.0, 6037.0], [1368.0, 5339.0], [1370.0, 6147.0], [1029.0, 5795.0], [1049.0, 5688.5], [1027.0, 5940.5], [1025.0, 5412.333333333333], [1055.0, 7702.0], [1053.0, 5756.0], [1051.0, 5194.333333333333], [1045.0, 3995.3333333333335], [1047.0, 5363.5], [1043.0, 5880.0], [1041.0, 5851.0], [1031.0, 7943.0], [1033.0, 8944.0], [1035.0, 6380.0], [1039.0, 6473.0], [1073.0, 7541.0], [1075.0, 6410.5], [1077.0, 5702.5], [1079.0, 5415.0], [1081.0, 7178.0], [1083.0, 5770.5], [1085.0, 8512.0], [1087.0, 7570.0], [1057.0, 7224.0], [1059.0, 7006.333333333333], [1061.0, 7766.0], [1063.0, 7685.0], [1065.0, 5666.5], [1067.0, 5794.0], [1069.0, 8681.0], [1071.0, 5487.0], [1037.0, 6911.5], [1093.0, 5446.666666666667], [1091.0, 8275.0], [1089.0, 8129.0], [1117.0, 7118.0], [1119.0, 7975.0], [1115.0, 5828.5], [1111.0, 7202.0], [1113.0, 6518.0], [1109.0, 5094.333333333333], [1107.0, 6980.0], [1105.0, 8364.0], [1095.0, 7337.0], [1097.0, 5702.5], [1099.0, 7485.0], [1101.0, 5233.6], [1103.0, 5513.5], [1127.0, 6045.0], [1129.0, 5465.0], [1131.0, 8365.0], [1133.0, 7780.0], [1135.0, 7079.0], [1125.0, 6631.0], [1123.0, 7016.0], [1121.0, 7019.0], [1151.0, 5999.5], [1145.0, 7867.0], [1147.0, 7836.0], [1149.0, 7055.0], [1141.0, 8048.0], [1143.0, 7062.0], [1137.0, 6724.0], [1139.0, 5660.333333333333], [1167.0, 7031.0], [1163.0, 5780.333333333333], [1153.0, 7685.0], [1155.0, 6681.0], [1157.0, 7646.0], [1181.0, 6709.5], [1183.0, 7526.0], [1179.0, 6057.666666666667], [1177.0, 7527.0], [1173.0, 7613.0], [1171.0, 7503.0], [1161.0, 6864.0], [1165.0, 5890.25], [1185.0, 6221.0], [1187.0, 5999.5], [1189.0, 5574.0], [1191.0, 7791.0], [1193.0, 5919.0], [1195.0, 7196.0], [1197.0, 6458.0], [1199.0, 6551.0], [1215.0, 7188.0], [1211.0, 6265.0], [1209.0, 6283.0], [1207.0, 6462.0], [1213.0, 6428.5], [1203.0, 7136.0], [1205.0, 4899.25], [1201.0, 5951.5], [1169.0, 8001.0], [1271.0, 6153.333333333333], [1231.0, 6080.0], [1217.0, 5665.333333333333], [1219.0, 7617.0], [1221.0, 7845.0], [1223.0, 5901.0], [1229.0, 6619.0], [1227.0, 7021.0], [1225.0, 5954.0], [1249.0, 6893.0], [1275.0, 7008.0], [1273.0, 6728.0], [1277.0, 6914.5], [1279.0, 6021.0], [1269.0, 6759.0], [1267.0, 7312.0], [1265.0, 5950.0], [1251.0, 5986.0], [1253.0, 6701.5], [1255.0, 7055.0], [1257.0, 6052.5], [1259.0, 7108.0], [1263.0, 6486.0], [1233.0, 7148.0], [1235.0, 5864.0], [1237.0, 5713.0], [1241.0, 5572.25], [1239.0, 7523.0], [1247.0, 5415.666666666667], [1245.0, 6979.0], [1243.0, 7551.0], [1291.0, 6357.0], [1281.0, 5771.5], [1311.0, 6403.0], [1309.0, 6093.666666666667], [1305.0, 6239.0], [1307.0, 6649.5], [1283.0, 5592.333333333334], [1285.0, 6275.8], [1289.0, 5555.0], [1287.0, 6907.0], [1317.0, 6216.0], [1315.0, 7605.0], [1313.0, 6660.0], [1319.0, 6558.0], [1343.0, 5534.0], [1341.0, 6800.0], [1339.0, 6541.0], [1335.0, 6803.0], [1337.0, 6102.0], [1295.0, 7345.0], [1293.0, 7324.0], [1329.0, 6775.0], [1331.0, 7002.0], [1333.0, 5716.0], [1321.0, 6493.5], [1323.0, 6535.0], [1327.0, 6165.666666666667], [1325.0, 7281.0], [1299.0, 6067.0], [1297.0, 6271.0], [1301.0, 5565.0], [1303.0, 6033.666666666667], [1347.0, 6100.0], [1345.0, 5481.0], [1375.0, 6098.0], [1373.0, 5760.0], [1349.0, 5423.0], [1351.0, 6551.0], [1353.0, 5766.0], [1355.0, 5686.0], [1357.0, 6941.0], [1359.0, 6148.0], [1377.0, 6778.0], [1365.0, 5756.0], [1363.0, 6197.0], [1361.0, 6449.0], [1367.0, 5981.0], [1369.0, 5785.0], [1371.0, 5504.0], [1.0, 12938.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[748.6419999999995, 8090.780999999992]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1377.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 306.25, "minX": 1.5496077E12, "maxY": 13654.466666666667, "series": [{"data": [[1.54960776E12, 13654.466666666667], [1.5496077E12, 343.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960776E12, 12193.75], [1.5496077E12, 306.25]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 546.3877551020407, "minX": 1.5496077E12, "maxY": 8280.26089185033, "series": [{"data": [[1.54960776E12, 8280.26089185033], [1.5496077E12, 546.3877551020407]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 546.3673469387754, "minX": 1.5496077E12, "maxY": 8280.255253716052, "series": [{"data": [[1.54960776E12, 8280.255253716052], [1.5496077E12, 546.3673469387754]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 23.85714285714286, "minX": 1.5496077E12, "maxY": 59.65658636596612, "series": [{"data": [[1.54960776E12, 59.65658636596612], [1.5496077E12, 23.85714285714286]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 338.0, "minX": 1.5496077E12, "maxY": 14701.0, "series": [{"data": [[1.54960776E12, 14701.0], [1.5496077E12, 879.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960776E12, 761.0], [1.5496077E12, 338.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960776E12, 12539.7], [1.5496077E12, 786.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960776E12, 13710.97], [1.5496077E12, 879.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960776E12, 13068.749999999996], [1.5496077E12, 844.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 515.0, "minX": 0.0, "maxY": 8404.0, "series": [{"data": [[0.0, 515.0], [32.0, 8404.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 32.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 515.0, "minX": 0.0, "maxY": 8404.0, "series": [{"data": [[0.0, 515.0], [32.0, 8404.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 32.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.683333333333333, "minX": 1.5496077E12, "maxY": 29.65, "series": [{"data": [[1.54960776E12, 29.65], [1.5496077E12, 3.683333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.8166666666666667, "minX": 1.5496077E12, "maxY": 32.516666666666666, "series": [{"data": [[1.54960776E12, 32.516666666666666], [1.5496077E12, 0.8166666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960776E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.8166666666666667, "minX": 1.5496077E12, "maxY": 32.516666666666666, "series": [{"data": [[1.54960776E12, 32.516666666666666], [1.5496077E12, 0.8166666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960776E12, "title": "Transactions Per Second"}},
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
